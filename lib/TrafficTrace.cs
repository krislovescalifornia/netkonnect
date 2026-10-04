using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Threading;

namespace NetKonnect {
  // Network metadata only. No packet payload, ETL files, or external dependencies.
  public static class TrafficTrace {
    const string SessionName = "netKonnect network traffic";
    static readonly Guid Tcp = new Guid("9a280ac0-c8e0-11d1-84e2-00c04fb998a2");
    static readonly Guid Udp = new Guid("bf3a50c5-a9c9-4988-a005-2df0b7c80f80");
    static readonly object Gate = new object();
    static readonly object StopGate = new object();
    static Dictionary<string, Flow> flows = new Dictionary<string, Flow>();
    static HashSet<string> local = new HashSet<string>();
    static ulong session, consumer;
    static IntPtr properties;
    static volatile bool stopping;
    static EventCallback callback = OnEvent;
    [UnmanagedFunctionPointer(CallingConvention.Winapi)] delegate void EventCallback(IntPtr record);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern uint StartTraceW(out ulong handle, string name, IntPtr props);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern uint ControlTraceW(ulong handle, string name, IntPtr props, uint control);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern ulong OpenTraceW(IntPtr logfile);
    [DllImport("advapi32.dll")] static extern uint ProcessTrace(ulong[] handles, uint count, IntPtr start, IntPtr end);
    [DllImport("advapi32.dll")] static extern uint CloseTrace(ulong handle);
    class Flow {
      public int Pid, LocalPort, RemotePort;
      public string Protocol, LocalAddress, RemoteAddress;
      public long Received, Sent;
    }
    static IntPtr Allocate(int size) {
      var p = Marshal.AllocHGlobal(size);
      Marshal.Copy(new byte[size], 0, p, size);
      return p;
    }
    static string Address(IntPtr data, int offset, int length) {
      var bytes = new byte[length]; Marshal.Copy(IntPtr.Add(data, offset), bytes, 0, length);
      return new IPAddress(bytes).ToString();
    }
    static int Port(IntPtr data, int offset) { return Marshal.ReadByte(data,offset)*256+Marshal.ReadByte(data,offset+1); }
    static void OnEvent(IntPtr record) {
      try {
        var provider = (Guid)Marshal.PtrToStructure(IntPtr.Add(record,24), typeof(Guid));
        if (provider != Tcp && provider != Udp) return;
        int opcode = Marshal.ReadByte(record,45), version = Marshal.ReadByte(record,42);
        if (version < 1 || (opcode != 10 && opcode != 11 && opcode != 26 && opcode != 27)) return;
        bool ipv6 = opcode >= 26, incoming = opcode == 11 || opcode == 27;
        int length = (ushort)Marshal.ReadInt16(record,86);
        if (length < (ipv6 ? 44 : 20)) return;
        var data = Marshal.ReadIntPtr(record,96);
        int pid = Marshal.ReadInt32(data,0);
        uint size = (uint)Marshal.ReadInt32(data,4);
        string dest = Address(data,8,ipv6 ? 16 : 4), source = Address(data,ipv6 ? 24 : 12,ipv6 ? 16 : 4);
        int dp = Port(data,ipv6 ? 40 : 16), sp = Port(data,ipv6 ? 42 : 18);
        // Some kernel receive schemas retain remote/local rather than wire order.
        // Resolve orientation from this computer's actual interface addresses.
        bool destLocal = local.Contains(dest), sourceLocal = local.Contains(source);
        if (!destLocal && !sourceLocal) return;
        bool reverse = destLocal && !sourceLocal;
        var f = new Flow { Pid=pid, Protocol=provider==Tcp ? "TCP" : "UDP", LocalAddress=reverse?dest:source,
          RemoteAddress=reverse?source:dest, LocalPort=reverse?dp:sp, RemotePort=reverse?sp:dp };
        string key = f.Protocol+"|"+pid+"|"+f.LocalAddress+"|"+f.LocalPort+"|"+f.RemoteAddress+"|"+f.RemotePort;
        lock (Gate) {
          Flow current;
          if (!flows.TryGetValue(key,out current)) {
            if (flows.Count >= 20000) return;
            flows[key] = current = f;
          }
          if (incoming) current.Received += size; else current.Sent += size;
        }
      } catch { /* Never allow a malformed event to unwind through the native callback. */ }
    }
    static void Stop() {
      lock (StopGate) {
        if (stopping) return; stopping = true;
        if (session != 0) ControlTraceW(session,SessionName,properties,1);
        if (consumer != 0 && consumer != ulong.MaxValue) CloseTrace(consumer);
      }
    }
    public static void Run(int parentId, int seconds) {
      Run(parentId, seconds, false);
    }
    public static void Run(int parentId, int seconds, bool recoverOwnedSession) {
      if (IntPtr.Size != 8) throw new Exception("Detailed traffic capture requires 64-bit PowerShell.");
      foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        foreach (var a in adapter.GetIPProperties().UnicastAddresses) local.Add(a.Address.ToString());
      local.Add("127.0.0.1"); local.Add("::1");
      properties = Allocate(120+2048);
      Marshal.WriteInt32(properties,0,120+2048);
      Marshal.WriteInt32(properties,40,1); // QPC clock
      Marshal.WriteInt32(properties,44,0x20000); // WNODE_FLAG_TRACED_GUID
      Marshal.WriteInt32(properties,48,64); // 64 KB buffers
      Marshal.WriteInt32(properties,52,4); Marshal.WriteInt32(properties,56,32);
      Marshal.WriteInt32(properties,64,0x100|0x02000000); // Real-time, separate system logger
      Marshal.WriteInt32(properties,68,1); // Flush every second
      Marshal.WriteInt32(properties,72,0x00010000); // Network TCP/IP (includes UDP)
      Marshal.WriteInt32(properties,116,120);
      uint result = StartTraceW(out session,SessionName,properties);
      // Only the authenticated installed helper may recover this app's reserved
      // trace after Task Scheduler forcibly ends an earlier helper on upgrade.
      // Ordinary/development collectors still report conflicts without stopping it.
      if (result == 183 && recoverOwnedSession) {
        uint stopped = ControlTraceW(0,SessionName,properties,1);
        if (stopped == 0) result = StartTraceW(out session,SessionName,properties);
      }
      if (result != 0) {
        Marshal.FreeHGlobal(properties);
        if (result == 5) throw new Exception("Detailed traffic capture needs Windows Administrator approval. Click Easy Button in netKonnect to set up measured app traffic and UDP/QUIC destinations.");
        if (result == 183) throw new Exception("A netKonnect traffic collector is already running. Close that instance before starting another.");
        throw new Exception("Windows could not start network tracing (error "+result+").");
      }
      IntPtr logger = Marshal.StringToHGlobalUni(SessionName), logfile = Allocate(448);
      Marshal.WriteIntPtr(logfile,8,logger);
      Marshal.WriteInt32(logfile,28,0x100|0x10000000); // Real-time EVENT_RECORD callback
      Marshal.WriteIntPtr(logfile,424,Marshal.GetFunctionPointerForDelegate(callback));
      Thread worker = null;
      try {
        consumer = OpenTraceW(logfile);
        if (consumer == ulong.MaxValue) throw new Exception("Windows could not open the network trace (error "+Marshal.GetLastWin32Error()+").");
        AppDomain.CurrentDomain.ProcessExit += delegate { Stop(); };
        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel=true; Stop(); };
        uint processResult = 0;
        worker = new Thread(delegate() { processResult = ProcessTrace(new ulong[]{consumer},1,IntPtr.Zero,IntPtr.Zero); });
        worker.IsBackground=true; worker.Start();
        // The server requests a graceful shutdown over this collector's private
        // stdin pipe so ETW is released before the server process exits.
        var control = new Thread(delegate() {
          try { if (Console.ReadLine() == "stop") Stop(); } catch { }
        });
        control.IsBackground=true; control.Start();
        Console.WriteLine("{\"type\":\"status\",\"available\":true}");
        var clock = Stopwatch.StartNew();
        var lifetime = Stopwatch.StartNew();
        while (!stopping) {
          Thread.Sleep(2000);
          if (seconds > 0 && lifetime.Elapsed.TotalSeconds > seconds) break;
          if (parentId > 0) { try { if (Process.GetProcessById(parentId).HasExited) break; } catch { break; } }
          if (!worker.IsAlive) throw new Exception("Network trace stopped (error "+processResult+").");
          double intervalSeconds = clock.Elapsed.TotalSeconds; clock.Restart();
          Dictionary<string,Flow> batch;
          lock (Gate) { batch=flows; flows=new Dictionary<string,Flow>(); }
          ControlTraceW(session,SessionName,properties,0); // query dropped-event counters
          int lost = Marshal.ReadInt32(properties,88)+Marshal.ReadInt32(properties,100);
          var rows = new List<string>();
          foreach (var f in batch.Values) rows.Add("{\"pid\":"+f.Pid+",\"protocol\":\""+f.Protocol+"\",\"localAddress\":\""+f.LocalAddress+"\",\"localPort\":"+f.LocalPort+",\"remoteAddress\":\""+f.RemoteAddress+"\",\"remotePort\":"+f.RemotePort+",\"receivedBytes\":"+f.Received+",\"sentBytes\":"+f.Sent+"}");
          Console.WriteLine("{\"type\":\"traffic\",\"timestamp\":\""+DateTime.UtcNow.ToString("o")+"\",\"elapsed\":"+intervalSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture)+",\"eventsLost\":"+lost+",\"flows\":["+String.Join(",",rows.ToArray())+"]}");
        }
      } finally {
        Stop(); if (worker != null) worker.Join(5000);
        Marshal.FreeHGlobal(logfile); Marshal.FreeHGlobal(logger); Marshal.FreeHGlobal(properties);
      }
    }
  }
}
