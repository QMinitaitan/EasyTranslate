using System;
using System.IO;
using System.Text;
using System.Linq;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;

// Benchmark instrumentation only. PID ancestry alone is unsafe when Windows reuses
// a PID: an old unrelated child can still name that PID as its parent.
public static class BenchNative {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
 [StructLayout(LayoutKind.Sequential)] struct PBI { public IntPtr ExitStatus,PebBaseAddress,AffinityMask,BasePriority,UniqueProcessId,ParentId; }
 [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h,int cls,ref PBI data,int length,out int used);
 static volatile bool stop;
 static Thread worker;

 // Known descendants survive their parent's exit, but never survive PID reuse.
 public static HashSet<int> SelectTree(int root,long rootBirth,Dictionary<int,int> parents,Dictionary<int,long> births,Dictionary<int,long> known) {
  var tree=new HashSet<int>();
  foreach(var pair in known) {
   long birth;
   if(births.TryGetValue(pair.Key,out birth)&&birth==pair.Value) tree.Add(pair.Key);
  }
  long currentRootBirth;
  if(births.TryGetValue(root,out currentRootBirth)&&currentRootBirth==rootBirth) tree.Add(root);
  bool changed=true;
  while(changed) {
   changed=false;
   foreach(var pair in parents) {
    long birth,parentBirth;
    if(tree.Contains(pair.Value)&&births.TryGetValue(pair.Key,out birth)&&births.TryGetValue(pair.Value,out parentBirth)
      &&birth>=rootBirth&&birth>=parentBirth&&tree.Add(pair.Key)) changed=true;
   }
  }
  known.Clear();
  foreach(int id in tree) known[id]=births[id];
  return tree;
 }

 public static void Start(int root,string output) {
  long rootBirth;
  using(var process=Process.GetProcessById(root)) rootBirth=process.StartTime.ToUniversalTime().Ticks;
  stop=false;
  worker=new Thread(()=> {
   var known=new Dictionary<int,long>();
   var last=new Dictionary<string,double>();
   double cumulative=0;
   using(var file=new StreamWriter(output,false,new UTF8Encoding(false))) {
    file.WriteLine("t,count,privateBytes,workingSetBytes,cumulativeCpuSeconds,pids,samplingMs,foreground,processes");
    while(!stop) {
     var clock=Stopwatch.StartNew();
     var ps=Process.GetProcesses();
     var parents=new Dictionary<int,int>();
     var births=new Dictionary<int,long>();
     foreach(var p in ps) try {
      var data=new PBI();int used;
      if(NtQueryInformationProcess(p.Handle,0,ref data,Marshal.SizeOf(typeof(PBI)),out used)==0) {
       parents[p.Id]=data.ParentId.ToInt32();births[p.Id]=p.StartTime.ToUniversalTime().Ticks;
      }
     } catch {}
     var tree=SelectTree(root,rootBirth,parents,births,known);
     long priv=0,ws=0;int count=0;var ids=new List<int>();var identities=new List<string>();
     foreach(var p in ps) {
      try {if(tree.Contains(p.Id)) {
       // Recheck identity: processes may exit and their PID may be reused during a sample.
       long birth=p.StartTime.ToUniversalTime().Ticks;
       if(birth!=births[p.Id]) continue;
       long processPrivate=p.PrivateMemorySize64,processWorkingSet=p.WorkingSet64;
       double cpu=p.TotalProcessorTime.TotalSeconds,prior;
       string identity=p.Id+":"+birth;
       if(last.TryGetValue(identity,out prior)) cumulative+=Math.Max(0,cpu-prior); else cumulative+=cpu;
       last[identity]=cpu;
       count++;ids.Add(p.Id);priv+=processPrivate;ws+=processWorkingSet;
       identities.Add(p.Id+":"+parents[p.Id]+":"+birth+":"+cpu.ToString(System.Globalization.CultureInfo.InvariantCulture)+":"+processPrivate+":"+processWorkingSet);
      }} catch {} finally {p.Dispose();}
     }
     file.WriteLine(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+","+count+","+priv+","+ws+","+cumulative.ToString(System.Globalization.CultureInfo.InvariantCulture)+","+String.Join(";",ids)+","+clock.ElapsedMilliseconds+","+GetForegroundWindow().ToInt64()+","+String.Join(";",identities));
     file.Flush();
     Thread.Sleep(Math.Max(1,100-(int)clock.ElapsedMilliseconds));
    }
   }
  });
  worker.IsBackground=true;worker.Start();
 }
 public static void Stop() {stop=true;if(worker!=null)worker.Join(5000);}
 public static void AltQ() {
  keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x51,0,0,UIntPtr.Zero);
  keybd_event(0x51,0,2,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);
 }
}
