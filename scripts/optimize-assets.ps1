param([string]$AssetDirectory = 'assets\whale',[int]$MaxEdge = 640)
Add-Type -AssemblyName System.Drawing
$directory = (Resolve-Path -LiteralPath $AssetDirectory).Path
Get-ChildItem -LiteralPath $directory -Filter '*.png' | ForEach-Object {
  $source = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $scale = [Math]::Min(1.0,$MaxEdge / [double][Math]::Max($source.Width,$source.Height))
  if ($scale -ge 1) { $source.Dispose(); return }
  $width = [Math]::Max(1,[int][Math]::Round($source.Width*$scale))
  $height = [Math]::Max(1,[int][Math]::Round($source.Height*$scale))
  $output = [System.Drawing.Bitmap]::new($width,$height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($source,0,0,$width,$height)
  $graphics.Dispose(); $source.Dispose()
  $temporary = "$($_.FullName).optimized.png"
  $output.Save($temporary,[System.Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose()
  Move-Item -LiteralPath $temporary -Destination $_.FullName -Force
}
