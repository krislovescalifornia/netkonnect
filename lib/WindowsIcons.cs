using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Web.Script.Serialization;

public sealed class IconRequest {
  public string id {get;set;} public string path {get;set;} public int pid {get;set;}
  public string name {get;set;} public string startedAt {get;set;}
}
public static class WindowsIcons {
  [StructLayout(LayoutKind.Sequential)] struct Size {public int width,height;public Size(int n){width=height=n;}}
  [ComImport,Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ImageFactory {[PreserveSig]int GetImage(Size size,int flags,out IntPtr bitmap);}
  [ComImport,Guid("000214f9-0000-0000-c000-000000000046"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ShellLink {
    [PreserveSig]int GetPath([Out,MarshalAs(UnmanagedType.LPWStr)]StringBuilder path,int count,IntPtr data,uint flags);
    [PreserveSig]int GetIDList(out IntPtr id);[PreserveSig]int SetIDList(IntPtr id);
    [PreserveSig]int GetDescription([Out,MarshalAs(UnmanagedType.LPWStr)]StringBuilder value,int count);[PreserveSig]int SetDescription([MarshalAs(UnmanagedType.LPWStr)]string value);
    [PreserveSig]int GetWorkingDirectory([Out,MarshalAs(UnmanagedType.LPWStr)]StringBuilder value,int count);[PreserveSig]int SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)]string value);
    [PreserveSig]int GetArguments([Out,MarshalAs(UnmanagedType.LPWStr)]StringBuilder value,int count);[PreserveSig]int SetArguments([MarshalAs(UnmanagedType.LPWStr)]string value);
    [PreserveSig]int GetHotkey(out ushort key);[PreserveSig]int SetHotkey(ushort key);
    [PreserveSig]int GetShowCmd(out int value);[PreserveSig]int SetShowCmd(int value);
    [PreserveSig]int GetIconLocation([Out,MarshalAs(UnmanagedType.LPWStr)]StringBuilder value,int count,out int index);
  }
  [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=true)] static extern int SHCreateItemFromParsingName(string name,IntPtr context,ref Guid iid,[MarshalAs(UnmanagedType.Interface)]out ImageFactory factory);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)] static extern uint ExtractIconEx(string file,int index,IntPtr large,IntPtr small,uint count);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetDriveType(string root);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process,int flags,StringBuilder path,ref int length);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process,ref uint length,StringBuilder id);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] struct BitmapInfo {
    public uint size;public int width,height;public ushort planes,bits;public uint compression,imageSize;public int xppm,yppm;public uint used,important;
  }
  [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr dc,IntPtr bitmap,uint start,uint lines,byte[] bits,ref BitmapInfo info,uint usage);
  [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
  [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
  static bool Local(string path) {
    return !String.IsNullOrEmpty(path) && path.Length>3 && Char.IsLetter(path[0]) && path[1]==':' && path[2]=='\\'
      && !path.Substring(2).Contains(":") && GetDriveType(Path.GetPathRoot(path))==3;
  }
  static Dictionary<string,string> Shortcuts(string[] roots) {
    var result=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);var folders=new Stack<string>();
    foreach(string root in roots)if(Local(root))folders.Push(root);
    int visited=0,links=0;
    while(folders.Count>0&&visited++<128&&links<512) {
      string folder=folders.Pop();
      try {
        if((File.GetAttributes(folder)&FileAttributes.ReparsePoint)!=0)continue;
        foreach(string child in Directory.GetDirectories(folder))if(Local(child))folders.Push(child);
        foreach(string file in Directory.GetFiles(folder,"*.lnk")) {
          if(links++>=512)break;object link=null;
          try {
            if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)continue;
            link=Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-c000-000000000046")));
            ((IPersistFile)link).Load(file,0);var shell=(ShellLink)link;
            var target=new StringBuilder(32768);var icon=new StringBuilder(32768);int index;
            shell.GetPath(target,target.Capacity,IntPtr.Zero,4);shell.GetIconLocation(icon,icon.Capacity,out index);
            string iconPath=Environment.ExpandEnvironmentVariables(icon.ToString());
            if(Local(target.ToString())&&Local(iconPath)&&ExtractIconEx(iconPath,-1,IntPtr.Zero,IntPtr.Zero,0)>0)result[target.ToString()]=file;
          }catch{}finally{if(link!=null)Marshal.ReleaseComObject(link);}
        }
      }catch{}
    }
    return result;
  }
  static string Image(string name) {
    ImageFactory factory=null;IntPtr handle=IntPtr.Zero;
    try {
      Guid iid=new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
      if(SHCreateItemFromParsingName(name,IntPtr.Zero,ref iid,out factory)!=0)return null;
      // ICONONLY, never a content thumbnail. Extraction runs in this isolated
      // background helper, not on the dashboard or capture thread.
      if(factory.GetImage(new Size(64),4,out handle)!=0 || handle==IntPtr.Zero)return null;
      using(Bitmap dimensions=Bitmap.FromHbitmap(handle)) {
        int width=dimensions.Width,height=dimensions.Height;
        if(width<1||height<1||width>256||height>256)return null;
        var info=new BitmapInfo {size=40,width=width,height=-height,planes=1,bits=32};
        byte[] pixels=new byte[width*height*4];IntPtr dc=GetDC(IntPtr.Zero);
        try {if(GetDIBits(dc,handle,0,(uint)height,pixels,ref info,0)==0)return null;}finally{ReleaseDC(IntPtr.Zero,dc);}
        bool visible=false;for(int i=3;i<pixels.Length;i+=4)if(pixels[i]>0){visible=true;break;}if(!visible)return null;
        using(Bitmap bitmap=new Bitmap(width,height,PixelFormat.Format32bppPArgb)) using(MemoryStream stream=new MemoryStream()) {
          var data=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppPArgb);
          try {for(int row=0;row<height;row++)Marshal.Copy(pixels,row*width*4,IntPtr.Add(data.Scan0,row*data.Stride),width*4);}finally{bitmap.UnlockBits(data);}
          bitmap.Save(stream,ImageFormat.Png);return Convert.ToBase64String(stream.ToArray());
        }
      }
    } finally {if(handle!=IntPtr.Zero)DeleteObject(handle);if(factory!=null)Marshal.ReleaseComObject(factory);}
  }
  public static string Read(string json) {
    return Read(json,new[]{Environment.GetFolderPath(Environment.SpecialFolder.StartMenu),Environment.GetFolderPath(Environment.SpecialFolder.CommonStartMenu)});
  }
  public static string Read(string json,string[] shortcutRoots) {
    var serializer=new JavaScriptSerializer();var output=new List<object>();Dictionary<string,string> shortcuts=null;
    foreach(IconRequest request in serializer.Deserialize<IconRequest[]>(json)) {
      string png=null,source=null,path=request.path;bool noIcon=false;
      try {
        if(!String.IsNullOrEmpty(path) && !Local(path)) {output.Add(new {id=request.id,png=(string)null,status="no-icon"});continue;}
        IntPtr process=request.pid>0?OpenProcess(0x1000,false,request.pid):IntPtr.Zero;
        try {
          if(process!=IntPtr.Zero) {
            var actual=new StringBuilder(32768);int length=actual.Capacity;
            if(QueryFullProcessImageName(process,0,actual,ref length) && Local(actual.ToString()) &&
              ((!String.IsNullOrEmpty(path)&&String.Equals(path,actual.ToString(),StringComparison.OrdinalIgnoreCase)) ||
               (String.IsNullOrEmpty(path)&&String.Equals(Path.GetFileNameWithoutExtension(actual.ToString()),request.name,StringComparison.OrdinalIgnoreCase)))) {
              bool same=true;
              if(!String.IsNullOrEmpty(request.startedAt)) {
                try {long created,exited,kernel,user;same=GetProcessTimes(process,out created,out exited,out kernel,out user) && Math.Abs((DateTime.FromFileTimeUtc(created)-DateTime.Parse(request.startedAt).ToUniversalTime()).TotalMilliseconds)<1;}catch{same=false;}
              }
              if(same) {
                path=actual.ToString();uint size=0;
                if(GetApplicationUserModelId(process,ref size,null)==122 && size>0 && size<1024) {
                  var appid=new StringBuilder((int)size);
                  if(GetApplicationUserModelId(process,ref size,appid)==0) {png=Image("shell:AppsFolder\\"+appid);source="windows-application";}
                }
              }
            }
          }
        } finally {if(process!=IntPtr.Zero)CloseHandle(process);}
        if(png==null && Local(path) && File.Exists(path)) {
          // Do not mistake the generic EXE association for an app-specific icon.
          noIcon=ExtractIconEx(path,-1,IntPtr.Zero,IntPtr.Zero,0)==0;
          if(!noIcon){png=Image(path);source="windows-file";}
          if(png==null) {
            if(shortcuts==null)shortcuts=Shortcuts(shortcutRoots);string shortcut;
            if(shortcuts.TryGetValue(path,out shortcut)) {png=Image(shortcut);source="windows-shortcut";}
          }
        }
      } catch {}
      output.Add(new {id=request.id,png=png,source=source,status=png!=null?"ready":noIcon?"no-icon":"unavailable"});
    }
    return serializer.Serialize(output);
  }
}
