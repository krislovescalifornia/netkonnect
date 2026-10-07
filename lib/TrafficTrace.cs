using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace NetKonnect {
  // Network metadata only. No packet payload, ETL files, or external dependencies.
  public static class TrafficTrace {
    const string SessionName = "netKonnect network traffic";
    static readonly Guid Tcp = new Guid("9a280ac0-c8e0-11d1-84e2-00c04fb998a2");
    static readonly Guid Udp = new Guid("bf3a50c5-a9c9-4988-a005-2df0b7c80f80");
    static readonly Guid ProcessProvider = new Guid("3d6fa8d0-fe05-11d0-9dda-00c04fd7ba7c");
    static readonly object Gate = new object();
    static readonly object StopGate = new object();
    static Dictionary<string, Flow> flows = new Dictionary<string, Flow>();
    static HashSet<string> local = new HashSet<string>();
    static Dictionary<int, Owner> owners = new Dictionary<int, Owner>();
    static long droppedFlowEvents, malformedEvents, unsupportedEvents;
    static bool addressRefreshAvailable = true;
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
    [DllImport("tdh.dll")] static extern uint TdhGetPropertySize(IntPtr record, uint contextCount, IntPtr contexts, uint propertyCount, IntPtr descriptor, out uint size);
    [DllImport("tdh.dll")] static extern uint TdhGetProperty(IntPtr record, uint contextCount, IntPtr contexts, uint propertyCount, IntPtr descriptor, uint size, byte[] buffer);
    class Owner { public string Name, StartedAt; public int ParentPid; }
    class Flow {
      public int Pid, LocalPort, RemotePort;
      public string Protocol, LocalAddress, RemoteAddress;
      public long Received, Sent;
      public long SendEvents, ReceiveEvents, ConnectEvents, AcceptEvents, DisconnectEvents, ReconnectEvents, RetransmitEvents, RetransmittedBytes;
      public string State;
      public Owner Owner;
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
    static string Quote(string value) {
      if (value == null) return "null";
      var output = new StringBuilder("\"");
      foreach (char c in value) {
        if (c == '\\' || c == '"') output.Append('\\').Append(c);
        else if (c < 32) output.Append("\\u").Append(((int)c).ToString("x4"));
        else output.Append(c);
      }
      return output.Append('"').ToString();
    }
    static byte[] Property(IntPtr record, string name) {
      IntPtr property = Marshal.StringToHGlobalUni(name), descriptor = Allocate(16);
      try {
        Marshal.WriteInt64(descriptor,0,property.ToInt64()); Marshal.WriteInt32(descriptor,8,-1);
        uint size;
        if (TdhGetPropertySize(record,0,IntPtr.Zero,1,descriptor,out size)!=0 || size==0 || size>32768) return null;
        var bytes=new byte[size];
        return TdhGetProperty(record,0,IntPtr.Zero,1,descriptor,size,bytes)==0 ? bytes : null;
      } finally { Marshal.FreeHGlobal(property); Marshal.FreeHGlobal(descriptor); }
    }
    static void OnProcess(IntPtr record, int opcode) {
      if (opcode!=1 && opcode!=2 && opcode!=3 && opcode!=4) return;
      var pidBytes=Property(record,"ProcessId");
      if (pidBytes==null || pidBytes.Length<4) { Interlocked.Increment(ref malformedEvents); return; }
      int pid=BitConverter.ToInt32(pidBytes,0);
      if (opcode==2 || opcode==4) { owners.Remove(pid); return; }
      byte[] image=Property(record,"ImageFileName"), parent=Property(record,"ParentId");
      if (image==null) { Interlocked.Increment(ref malformedEvents); return; }
      // Kernel ImageFileName is an ANSI string. Never read CommandLine or UserSID.
      string name=Encoding.Default.GetString(image).TrimEnd('\0');
      name=System.IO.Path.GetFileNameWithoutExtension(name);
      if (String.IsNullOrEmpty(name)) return;
      if (owners.Count>=20000 && !owners.ContainsKey(pid)) { owners.Clear(); Interlocked.Increment(ref droppedFlowEvents); }
      DateTime observed=DateTime.FromFileTimeUtc(Marshal.ReadInt64(record,16));
      string startedAt=opcode==1 ? observed.ToString("o") : null;
      try {
        using (var process=Process.GetProcessById(pid)) {
          DateTime created=process.StartTime.ToUniversalTime();
          // A newer process may have reused the PID while ETW was buffered.
          if (created<=observed && (opcode==3 || (observed-created).TotalSeconds<1)) startedAt=created.ToString("o");
        }
      } catch { /* Exited/protected owners retain the observed kernel lifetime. */ }
      owners[pid]=new Owner {Name=name, ParentPid=parent!=null && parent.Length>=4 ? BitConverter.ToInt32(parent,0) : 0, StartedAt=startedAt};
    }
    static void RefreshLocalAddresses() {
      try {
        var addresses=new HashSet<string>();
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
          foreach (var a in adapter.GetIPProperties().UnicastAddresses) {
            // ETW IPv6 bytes omit the scope ID, including on link-local adapters.
            addresses.Add(new IPAddress(a.Address.GetAddressBytes()).ToString());
          }
        addresses.Add("127.0.0.1"); addresses.Add("::1");
        local=addresses; addressRefreshAvailable=true;
      } catch { addressRefreshAvailable=false; }
    }
    static void OnEvent(IntPtr record) {
      try {
        var provider = (Guid)Marshal.PtrToStructure(IntPtr.Add(record,24), typeof(Guid));
        int opcode = Marshal.ReadByte(record,45), version = Marshal.ReadByte(record,42);
        if (provider == ProcessProvider) { OnProcess(record,opcode); return; }
        if (provider != Tcp && provider != Udp) return;
        bool ipv6=opcode>=26 && opcode<=32;
        int kind=ipv6 ? opcode-16 : opcode;
        // Copy events and TCP fail events have different semantics/schemas.
        if (kind<10 || kind>16 || (provider==Udp && kind!=10 && kind!=11)) return;
        if (version<1 || version>2) { Interlocked.Increment(ref unsupportedEvents); return; }
        bool incoming=kind==11 || kind==15;
        int length = (ushort)Marshal.ReadInt16(record,86);
        if (length < (ipv6 ? 44 : 20)) { Interlocked.Increment(ref malformedEvents); return; }
        var data = Marshal.ReadIntPtr(record,96);
        if (data==IntPtr.Zero) { Interlocked.Increment(ref malformedEvents); return; }
        int pid = Marshal.ReadInt32(data,0);
        uint size = (uint)Marshal.ReadInt32(data,4);
        string dest = Address(data,8,ipv6 ? 16 : 4), source = Address(data,ipv6 ? 24 : 12,ipv6 ? 16 : 4);
        int dp = Port(data,ipv6 ? 40 : 16), sp = Port(data,ipv6 ? 42 : 18);
        // Some kernel receive schemas retain remote/local rather than wire order.
        // Resolve orientation from this computer's actual interface addresses.
        var addresses=local;
        bool destLocal = addresses.Contains(dest), sourceLocal = addresses.Contains(source);
        // Trust a unique local-address match. Otherwise use the ETW opcode so
        // multicast/broadcast receives and newly assigned addresses survive.
        bool reverse = destLocal!=sourceLocal ? destLocal : incoming;
        var f = new Flow { Pid=pid, Protocol=provider==Tcp ? "TCP" : "UDP", LocalAddress=reverse?dest:source,
          RemoteAddress=reverse?source:dest, LocalPort=reverse?dp:sp, RemotePort=reverse?sp:dp };
        Owner owner; if (owners.TryGetValue(pid,out owner)) f.Owner=owner;
        string key = f.Protocol+"|"+pid+"|"+f.LocalAddress+"|"+f.LocalPort+"|"+f.RemoteAddress+"|"+f.RemotePort;
        if (owner!=null && owner.StartedAt!=null) key+="|"+owner.StartedAt;
        lock (Gate) {
          Flow current;
          if (!flows.TryGetValue(key,out current)) {
            if (flows.Count >= 20000) { Interlocked.Increment(ref droppedFlowEvents); return; }
            flows[key] = current = f;
          }
          if (kind==10) { current.Sent+=size; current.SendEvents++; }
          else if (kind==11) { current.Received+=size; current.ReceiveEvents++; }
          else if (kind==12) { current.ConnectEvents++; current.State="Connected"; }
          else if (kind==15) { current.AcceptEvents++; current.State="Accepted"; }
          else if (kind==13) { current.DisconnectEvents++; current.State="Disconnected"; }
          else if (kind==16) { current.ReconnectEvents++; current.State="Reconnecting"; }
          else if (kind==14) { current.RetransmitEvents++; current.RetransmittedBytes+=size; }
        }
      } catch { Interlocked.Increment(ref malformedEvents); /* Never unwind through the native callback. */ }
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
      RefreshLocalAddresses();
      properties = Allocate(120+2048);
      Marshal.WriteInt32(properties,0,120+2048);
      Marshal.WriteInt32(properties,40,1); // QPC clock
      Marshal.WriteInt32(properties,44,0x20000); // WNODE_FLAG_TRACED_GUID
      Marshal.WriteInt32(properties,48,64); // 64 KB buffers
      Marshal.WriteInt32(properties,52,4); Marshal.WriteInt32(properties,56,32);
      Marshal.WriteInt32(properties,64,0x100|0x02000000); // Real-time, separate system logger
      Marshal.WriteInt32(properties,68,1); // Flush every second
      Marshal.WriteInt32(properties,72,0x00010001); // Network TCP/IP + process lifecycle
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
        Console.WriteLine("{\"type\":\"evidence-status\",\"source\":\"process-etw\",\"available\":true,\"message\":\"Kernel process lifetimes identify applications that exit between snapshots. No command lines are collected.\"}");
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
          uint lost = (uint)Marshal.ReadInt32(properties,88), buffersLost = (uint)Marshal.ReadInt32(properties,100);
          RefreshLocalAddresses();
          var rows = new List<string>();
          foreach (var f in batch.Values) {
            string owner=f.Owner==null ? "null" : "{\"name\":"+Quote(f.Owner.Name)+",\"startedAt\":"+Quote(f.Owner.StartedAt)+",\"parentPid\":"+f.Owner.ParentPid+",\"source\":\"process-etw\"}";
            rows.Add("{\"pid\":"+f.Pid+",\"protocol\":\""+f.Protocol+"\",\"localAddress\":\""+f.LocalAddress+"\",\"localPort\":"+f.LocalPort+",\"remoteAddress\":\""+f.RemoteAddress+"\",\"remotePort\":"+f.RemotePort+",\"receivedBytes\":"+f.Received+",\"sentBytes\":"+f.Sent+",\"owner\":"+owner+",\"etwState\":"+Quote(f.State)+",\"transportEvents\":{\"sent\":"+f.SendEvents+",\"received\":"+f.ReceiveEvents+",\"connected\":"+f.ConnectEvents+",\"accepted\":"+f.AcceptEvents+",\"disconnected\":"+f.DisconnectEvents+",\"reconnected\":"+f.ReconnectEvents+",\"retransmitted\":"+f.RetransmitEvents+",\"retransmittedBytes\":"+f.RetransmittedBytes+"}}");
          }
          Console.WriteLine("{\"type\":\"traffic\",\"timestamp\":\""+DateTime.UtcNow.ToString("o")+"\",\"elapsed\":"+intervalSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture)+",\"eventsLost\":"+lost+",\"buffersLost\":"+buffersLost+",\"collectorDropped\":"+Interlocked.Read(ref droppedFlowEvents)+",\"malformedEvents\":"+Interlocked.Read(ref malformedEvents)+",\"unsupportedEvents\":"+Interlocked.Read(ref unsupportedEvents)+",\"addressRefreshAvailable\":"+(addressRefreshAvailable?"true":"false")+",\"flows\":["+String.Join(",",rows.ToArray())+"]}");
        }
      } finally {
        Stop(); if (worker != null) worker.Join(5000);
        Marshal.FreeHGlobal(logfile); Marshal.FreeHGlobal(logger); Marshal.FreeHGlobal(properties);
      }
    }
  }
}
