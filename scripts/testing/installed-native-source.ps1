param([Parameter(Mandatory=$true)][string]$Run,[switch]$RegisterAltQ)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'installed-file-protocol.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class InstalledSourceNative {
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int left,top,right,bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct GUI {public int size,flags;public IntPtr active,focus,capture,menuOwner,moveSize,caret;public RECT caretRect;}
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint id,ref GUI info);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint process);
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h,int id,uint modifiers,uint key);
 [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h,int id);
 public static long Focus(IntPtr h){uint process;uint thread=GetWindowThreadProcessId(h,out process);GUI info=new GUI();info.size=Marshal.SizeOf(typeof(GUI));return GetGUIThreadInfo(thread,ref info)?info.focus.ToInt64():-1;}
 public static int Flags(IntPtr h){uint process;uint thread=GetWindowThreadProcessId(h,out process);GUI info=new GUI();info.size=Marshal.SizeOf(typeof(GUI));return GetGUIThreadInfo(thread,ref info)?info.flags:-1;}
 public static uint ForegroundProcess(){uint process;GetWindowThreadProcessId(GetForegroundWindow(),out process);return process;}
 public static bool Down(int key){return (GetAsyncKeyState(key)&0x8000)!=0;}
}
'@
$form=New-Object Windows.Forms.Form
$form.Text='EasyTranslate PR12 isolated native source';$form.Width=650;$form.Height=210;$form.StartPosition='CenterScreen'
$box=New-Object Windows.Forms.TextBox
$box.Multiline=$true;$box.Dock='Fill';$box.ReadOnly=$true;$box.Text='INSTALLED_NATIVE';$form.Controls.Add($box)
$script:expectedSelection='INSTALLED_NATIVE'
$timer=New-Object Windows.Forms.Timer;$timer.Interval=25
$script:last=''
$timer.add_Tick({
 $file=Join-Path $Run 'source-command.json'
 if(Test-Path -LiteralPath $file){
  $raw=Read-OwnedText $file
  if($raw -ne $script:last){
   $script:last=$raw;$cmd=$raw|ConvertFrom-Json
   if($cmd.action -eq 'stop'){$form.Close();return}
   $box.Text=$cmd.text;$form.Activate();$box.Focus()|Out-Null
   if($cmd.empty){$box.SelectionStart=$box.TextLength;$box.SelectionLength=0}else{$box.SelectAll()}
   $script:expectedSelection=if($cmd.empty){''}else{$cmd.text}
   Write-OwnedText (Join-Path $Run 'source-ready.json') ($cmd|ConvertTo-Json -Compress)
  }
 }
 $selection=$box.SelectedText
 [IO.File]::AppendAllText((Join-Path $Run 'source-samples.jsonl'),(@{t=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();foreground=[InstalledSourceNative]::GetForegroundWindow().ToInt64();foregroundProcess=[InstalledSourceNative]::ForegroundProcess();expected=$form.Handle.ToInt64();keyboardFocus=[InstalledSourceNative]::Focus($form.Handle);expectedFocus=$box.Handle.ToInt64();guiFlags=[InstalledSourceNative]::Flags($form.Handle);altDown=[InstalledSourceNative]::Down(0x12);ctrlDown=[InstalledSourceNative]::Down(0x11);shiftDown=[InstalledSourceNative]::Down(0x10);expectedSelection=($selection -ceq $script:expectedSelection);selectionLength=$selection.Length}|ConvertTo-Json -Compress)+"`n")
})
$form.add_Shown({$hotkey=if($RegisterAltQ){[InstalledSourceNative]::RegisterHotKey($form.Handle,1912,0x4001,0x51)}else{$false};$form.Activate();$box.Focus()|Out-Null;$box.SelectAll();Write-OwnedText (Join-Path $Run 'source-window.json') (@{handle=$form.Handle.ToInt64();textbox=$box.Handle.ToInt64();pid=$PID;registeredAltQ=$hotkey;x=$form.Left;y=$form.Top;width=$form.Width;height=$form.Height}|ConvertTo-Json -Compress);$timer.Start()})
try{[Windows.Forms.Application]::Run($form)}finally{if($RegisterAltQ){[InstalledSourceNative]::UnregisterHotKey($form.Handle,1912)|Out-Null};$timer.Stop();$timer.Dispose();$form.Dispose()}
