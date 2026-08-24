param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath))
$bitmap = [System.Drawing.Bitmap]::new($source.Width,$source.Height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImageUnscaled($source,0,0)
$graphics.Dispose()
$source.Dispose()

$visited = [bool[]]::new($bitmap.Width * $bitmap.Height)
$queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'
for ($x=0; $x -lt $bitmap.Width; $x++) { $queue.Enqueue([System.Drawing.Point]::new($x,0)); $queue.Enqueue([System.Drawing.Point]::new($x,$bitmap.Height-1)) }
for ($y=1; $y -lt $bitmap.Height-1; $y++) { $queue.Enqueue([System.Drawing.Point]::new(0,$y)); $queue.Enqueue([System.Drawing.Point]::new($bitmap.Width-1,$y)) }

while ($queue.Count -gt 0) {
  $point = $queue.Dequeue()
  $index = $point.Y * $bitmap.Width + $point.X
  if ($visited[$index]) { continue }
  $visited[$index] = $true
  $color = $bitmap.GetPixel($point.X,$point.Y)
  $max = [Math]::Max($color.R,[Math]::Max($color.G,$color.B))
  $min = [Math]::Min($color.R,[Math]::Min($color.G,$color.B))
  if ($color.A -gt 10 -and !($min -ge 232 -and ($max-$min) -le 18)) { continue }
  $bitmap.SetPixel($point.X,$point.Y,[System.Drawing.Color]::Transparent)
  if ($point.X -gt 0) { $queue.Enqueue([System.Drawing.Point]::new($point.X-1,$point.Y)) }
  if ($point.X+1 -lt $bitmap.Width) { $queue.Enqueue([System.Drawing.Point]::new($point.X+1,$point.Y)) }
  if ($point.Y -gt 0) { $queue.Enqueue([System.Drawing.Point]::new($point.X,$point.Y-1)) }
  if ($point.Y+1 -lt $bitmap.Height) { $queue.Enqueue([System.Drawing.Point]::new($point.X,$point.Y+1)) }
}

$bitmap.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
