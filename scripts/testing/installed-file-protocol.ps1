# Owned fixture command files use one writer and atomic replacement.
# Readers explicitly allow replacement while their old file handle is open.
function Read-OwnedText([string]$File) {
 $stream=New-Object IO.FileStream($File,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
 $reader=New-Object IO.StreamReader($stream)
 try{return $reader.ReadToEnd()}finally{$reader.Dispose();$stream.Dispose()}
}
function Write-OwnedText([string]$File,[string]$Text) {
 $next=$File+'.next.'+$PID
 [IO.File]::WriteAllText($next,$Text)
 if([IO.File]::Exists($File)){[IO.File]::Replace($next,$File,[NullString]::Value)}else{[IO.File]::Move($next,$File)}
}
