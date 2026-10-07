using System;
using System.Collections.Generic;
using System.Diagnostics.Eventing.Reader;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Xml;

namespace NetKonnect {
  public static class NameTrace {
    const string SessionName="netKonnect name evidence";
    static readonly Guid Dns=new Guid("1c95126e-7eea-49a9-a3fe-a378b03ddb4d");
    static ulong session,consumer;static bool ownsSession;static IntPtr properties,logfile,logger;static Thread worker;static EventLogWatcher firewall;
    static readonly object Gate=new object();static readonly EventCallback Callback=OnEvent;
    [UnmanagedFunctionPointer(CallingConvention.Winapi)]delegate void EventCallback(IntPtr record);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern uint StartTraceW(out ulong handle,string name,IntPtr props);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern uint ControlTraceW(ulong handle,string name,IntPtr props,uint control);
    [DllImport("advapi32.dll")]static extern uint EnableTraceEx2(ulong handle,ref Guid provider,uint control,byte level,ulong any,ulong all,uint timeout,IntPtr parameters);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode)]static extern ulong OpenTraceW(IntPtr logfile);
    [DllImport("advapi32.dll")]static extern uint ProcessTrace(ulong[] handles,uint count,IntPtr start,IntPtr end);
    [DllImport("advapi32.dll")]static extern uint CloseTrace(ulong handle);
    [DllImport("tdh.dll")]static extern uint TdhGetPropertySize(IntPtr record,uint contextCount,IntPtr contexts,uint propertyCount,IntPtr descriptor,out uint size);
    [DllImport("tdh.dll")]static extern uint TdhGetProperty(IntPtr record,uint contextCount,IntPtr contexts,uint propertyCount,IntPtr descriptor,uint size,byte[] buffer);
    static IntPtr Allocate(int size){var p=Marshal.AllocHGlobal(size);Marshal.Copy(new byte[size],0,p,size);return p;}
    static string Quote(string value){return "\""+(value??"").Replace("\\","\\\\").Replace("\"","\\\"").Replace("\r"," ").Replace("\n"," ").Replace("\t"," ")+"\"";}
    static void Status(string source,bool available,string message){Console.WriteLine("{\"type\":\"evidence-status\",\"source\":"+Quote(source)+",\"available\":"+(available?"true":"false")+",\"message\":"+Quote(message)+"}");}
    static byte[] Property(IntPtr record,string name) {
      IntPtr property=Marshal.StringToHGlobalUni(name),descriptor=Allocate(16);
      try {
        Marshal.WriteInt64(descriptor,0,property.ToInt64());Marshal.WriteInt32(descriptor,8,-1);
        uint size;if(TdhGetPropertySize(record,0,IntPtr.Zero,1,descriptor,out size)!=0 || size==0 || size>32768)return null;
        byte[] bytes=new byte[size];return TdhGetProperty(record,0,IntPtr.Zero,1,descriptor,size,bytes)==0?bytes:null;
      } finally {Marshal.FreeHGlobal(property);Marshal.FreeHGlobal(descriptor);}
    }
    static string StringProperty(IntPtr record,string name){var bytes=Property(record,name);return bytes==null?null:Encoding.Unicode.GetString(bytes).TrimEnd('\0');}
    static void OnEvent(IntPtr record) {
      try {
        if((Guid)Marshal.PtrToStructure(IntPtr.Add(record,24),typeof(Guid))!=Dns || (ushort)Marshal.ReadInt16(record,40)!=3008)return;
        string name=StringProperty(record,"QueryName"),results=StringProperty(record,"QueryResults");
        var status=Property(record,"QueryStatus");if(status!=null&&status.Length>=4&&BitConverter.ToUInt32(status,0)!=0)return;
        if(String.IsNullOrEmpty(name)||String.IsNullOrEmpty(results)||name.Length>253)return;
        var addresses=new List<string>();
        foreach(string part in results.Split(new char[]{';',' ','\t','\r','\n',','},StringSplitOptions.RemoveEmptyEntries)) {
          IPAddress address;if(IPAddress.TryParse(part.Trim('[',']'),out address))addresses.Add(Quote(address.ToString()));
          if(addresses.Count>=64)break;
        }
        if(addresses.Count==0)return;
        int pid=Marshal.ReadInt32(record,12);var type=Property(record,"QueryType");int queryType=type!=null&&type.Length>=2?BitConverter.ToUInt16(type,0):0;
        // ProcessTrace converts timestamps to FILETIME unless RAW_TIMESTAMP is set.
        string seenAt=DateTime.FromFileTimeUtc(Marshal.ReadInt64(record,16)).ToString("o");
        Console.WriteLine("{\"type\":\"name-evidence\",\"records\":[{\"pid\":"+pid+",\"hostname\":"+Quote(name)+",\"seenAt\":"+Quote(seenAt)+",\"queryType\":"+queryType+",\"addresses\":["+String.Join(",",addresses.ToArray())+"]}]}");
      }catch{/* Schema changes leave evidence unavailable rather than guessing. */}
    }
    public static string ParseFirewall(string xmlText,int eventId,DateTime time) {
      if(eventId!=5156&&eventId!=5157&&eventId!=5152)return null;
        try {
          var xml=new XmlDocument();xml.XmlResolver=null;xml.LoadXml(xmlText);
          var data=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);foreach(XmlNode node in xml.GetElementsByTagName("Data"))if(node.Attributes["Name"]!=null)data[node.Attributes["Name"].Value]=node.InnerText;
          string source,target,pid,sp,dp,protocol,direction;
          if(!data.TryGetValue("SourceAddress",out source)||!data.TryGetValue("DestAddress",out target)||!data.TryGetValue("ProcessID",out pid)||!data.TryGetValue("SourcePort",out sp)||!data.TryGetValue("DestPort",out dp)||!data.TryGetValue("Protocol",out protocol))return null;
          data.TryGetValue("Direction",out direction);if(direction!="%%14592"&&direction!="%%14593")return null;bool inbound=direction=="%%14592";
          long owner=pid.StartsWith("0x")?Convert.ToInt64(pid.Substring(2),16):Convert.ToInt64(pid);
          int localPort=int.Parse(inbound?dp:sp),remotePort=int.Parse(inbound?sp:dp);IPAddress local,remote;
          if(!IPAddress.TryParse(inbound?target:source,out local)||!IPAddress.TryParse(inbound?source:target,out remote))return null;
          string transport=protocol=="6"?"TCP":protocol=="17"?"UDP":null;if(transport==null)return null;
          string seenAt=time.ToUniversalTime().ToString("o");
          return "{\"type\":\"connection-evidence\",\"records\":[{\"source\":\"wfp-audit\",\"pid\":"+owner+",\"seenAt\":"+Quote(seenAt)+",\"protocol\":"+Quote(transport)+",\"localAddress\":"+Quote(local.ToString())+",\"remoteAddress\":"+Quote(remote.ToString())+",\"localPort\":"+localPort+",\"remotePort\":"+remotePort+",\"outcome\":"+Quote(eventId==5156?"permitted":"blocked")+",\"eventId\":"+eventId+"}]}";
        }catch{return null;}
    }
    static void OnFirewall(object sender,EventRecordWrittenEventArgs args) {
      if(args.EventException!=null){Status("wfp-audit",false,"Windows firewall audit records are unavailable.");return;}
      using(var record=args.EventRecord) {
        if(record==null||!record.TimeCreated.HasValue)return;
        var output=ParseFirewall(record.ToXml(),record.Id,record.TimeCreated.Value);if(output!=null)Console.WriteLine(output);
      }
    }
    public static void Start(bool recover) {
      lock(Gate) {
        try {
          properties=Allocate(120+2048);Marshal.WriteInt32(properties,0,120+2048);Marshal.WriteInt32(properties,40,1);Marshal.WriteInt32(properties,44,0x20000);
          Marshal.WriteInt32(properties,48,64);Marshal.WriteInt32(properties,52,2);Marshal.WriteInt32(properties,56,8);Marshal.WriteInt32(properties,64,0x100);Marshal.WriteInt32(properties,68,1);Marshal.WriteInt32(properties,116,120);
          uint result=StartTraceW(out session,SessionName,properties);
          if(result==183&&recover){if(ControlTraceW(0,SessionName,properties,1)==0)result=StartTraceW(out session,SessionName,properties);}
          if(result!=0)throw new Exception("Name tracing unavailable (Windows error "+result+").");
          ownsSession=true;
          var provider=Dns;result=EnableTraceEx2(session,ref provider,1,4,ulong.MaxValue,0,0,IntPtr.Zero);if(result!=0)throw new Exception("DNS provider unavailable (Windows error "+result+").");
          logger=Marshal.StringToHGlobalUni(SessionName);logfile=Allocate(448);Marshal.WriteIntPtr(logfile,8,logger);Marshal.WriteInt32(logfile,28,0x100|0x10000000);Marshal.WriteIntPtr(logfile,424,Marshal.GetFunctionPointerForDelegate(Callback));
          consumer=OpenTraceW(logfile);if(consumer==ulong.MaxValue)throw new Exception("DNS consumer unavailable.");
          worker=new Thread(delegate(){uint code=ProcessTrace(new ulong[]{consumer},1,IntPtr.Zero,IntPtr.Zero);if(session!=0)Status("windows-dns-etw",false,"DNS trace ended (Windows error "+code+").");});worker.IsBackground=true;worker.Start();
          Status("windows-dns-etw",true,"Passive OS resolver events; browser private DNS may use its own resolver.");
        }catch(Exception error){StopDns();Status("windows-dns-etw",false,error.Message);}
        try {
          firewall=new EventLogWatcher(new EventLogQuery("Security",PathType.LogName,"*[System[(EventID=5156 or EventID=5157 or EventID=5152)]]"),null,false);
          firewall.EventRecordWritten+=OnFirewall;firewall.Enabled=true;
          Status("wfp-audit",true,"Listening to existing firewall auditing. No records does not prove there were no blocks; Windows auditing must already be enabled.");
        }catch{Status("wfp-audit",false,"Security audit access unavailable or Windows firewall auditing is disabled.");}
      }
    }
    static void StopDns() {
      if(session!=0&&ownsSession){ControlTraceW(session,SessionName,properties,1);}session=0;ownsSession=false;
      if(consumer!=0&&consumer!=ulong.MaxValue){CloseTrace(consumer);consumer=0;}
      if(worker!=null){worker.Join(3000);worker=null;}
      if(properties!=IntPtr.Zero){Marshal.FreeHGlobal(properties);properties=IntPtr.Zero;}
      if(logfile!=IntPtr.Zero){Marshal.FreeHGlobal(logfile);logfile=IntPtr.Zero;}
      if(logger!=IntPtr.Zero){Marshal.FreeHGlobal(logger);logger=IntPtr.Zero;}
    }
    public static void Stop(){lock(Gate){if(firewall!=null){firewall.Dispose();firewall=null;}StopDns();}}
  }
}
