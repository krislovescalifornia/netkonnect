using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace NetKonnect {
  // An ordinary per-user native messaging host. No elevation or network sockets.
  public static class BrowserHost {
    const int MaxFrame = 65536;
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength=MaxFrame, RecursionLimit=24 };
    static byte[] Read(Stream stream,int length) {
      byte[] bytes=new byte[length]; int offset=0;
      while(offset<length) {int n=stream.Read(bytes,offset,length-offset);if(n==0){if(offset==0)return null;throw new IOException("Incomplete native frame.");}offset+=n;}
      return bytes;
    }
    static void Write(Stream stream,object message) {
      byte[] bytes=Encoding.UTF8.GetBytes(Json.Serialize(message));
      stream.Write(BitConverter.GetBytes(bytes.Length),0,4);stream.Write(bytes,0,bytes.Length);stream.Flush();
    }
    public static int Main(string[] args) {
      string source=null;
      if(args.Length==2 && args[1]=="service-insight@netkonnect.local")source="firefox";
      if(args.Length>=1 && args.Length<=2 && (args.Length==1 || Regex.IsMatch(args[1],"^--parent-window=[0-9]+$"))) {
        if(args[0]=="chrome-extension://ghhkklahefoedmdlfehpcjkfaleihnmi/")source="chrome";
        if(args[0]=="chrome-extension://ofckebaebjcpecjmiddbcchaipikgmmf/")source="edge";
      }
      if(source==null)return 1;
      var input=Console.OpenStandardInput();var output=Console.OpenStandardOutput();
      string directory=Directory.GetParent(Path.GetDirectoryName(typeof(BrowserHost).Assembly.Location)).FullName;
      while(true) {
        try {
          byte[] header=Read(input,4);if(header==null)return 0;
          uint length=BitConverter.ToUInt32(header,0);if(length==0 || length>MaxFrame)return 1;
          var bytes=Read(input,(int)length);if(bytes==null)return 1;
          var payload=Json.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes));
          payload["source"]=source; // Bind provenance to the browser caller, never the submitted payload.
          var endpoint=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(directory,"companion.json")));
          string path=Convert.ToString(endpoint["pipe"]),token=Convert.ToString(endpoint["token"]);
          if(!Regex.IsMatch(path,@"^\\\\\.\\pipe\\netkonnect-[a-f0-9]+$") || !Regex.IsMatch(token,"^[a-f0-9]{64}$"))throw new Exception();
          using(var pipe=new NamedPipeClientStream(".",path.Substring(9),PipeDirection.InOut,PipeOptions.Asynchronous)) {
            pipe.Connect(3000);
            byte[] request=Encoding.UTF8.GetBytes(Json.Serialize(new {token=token,method="browser-evidence",@params=payload})+"\n");
            if(request.Length>120000)return 1;
            pipe.Write(request,0,request.Length);pipe.Flush();
            // Bound a stalled companion read using asynchronous I/O.
            byte[] response=new byte[4096];var buffer=new MemoryStream();DateTime deadline=DateTime.UtcNow.AddSeconds(5);
            while(true) {
              var read=pipe.BeginRead(response,0,response.Length,null,null);
              int remaining=(int)(deadline-DateTime.UtcNow).TotalMilliseconds;
              var wait=read.AsyncWaitHandle;int count;
              try {if(remaining<=0||!wait.WaitOne(remaining))throw new IOException();count=pipe.EndRead(read);}finally{wait.Close();}
              if(count==0||buffer.Length+count>MaxFrame)throw new IOException();
              buffer.Write(response,0,count);if(Array.IndexOf(response,(byte)10,0,count)>=0)break;
            }
            var result=Json.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(buffer.ToArray()).Trim());
            Write(output,result.ContainsKey("error") ? new {error=Convert.ToString(result["error"])} : result["result"]);
          }
        } catch(Exception error) {Console.Error.WriteLine(error.GetType().Name);try{Write(output,new {error="The local netKonnect companion is unavailable or rejected this observation."});}catch{return 1;}}
      }
    }
  }
}
