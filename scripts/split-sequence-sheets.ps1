param(
  [string]$SheetRoot = (Join-Path $PSScriptRoot '..\artifacts\sequence-sheets'),
  [string]$OutputRoot = (Join-Path $PSScriptRoot '..\assets\whale\sequences'),
  [string]$SheetSuffix = 'sheet-alpha.png',
  [string]$FramePrefix = 'frame',
  [int]$FrameSize = 320
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Remove-NeighborBleed([System.Drawing.Bitmap]$bitmap) {
  $width = $bitmap.Width; $height = $bitmap.Height; $length = $width * $height
  $opaque = New-Object 'bool[]' $length
  $labels = New-Object 'int[]' $length
  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      $opaque[$y * $width + $x] = $bitmap.GetPixel($x, $y).A -gt 8
    }
  }
  $queue = New-Object 'int[]' $length
  $components = @()
  $label = 0
  for ($start = 0; $start -lt $length; $start++) {
    if (-not $opaque[$start] -or $labels[$start] -ne 0) { continue }
    $label++; $head = 0; $tail = 1; $queue[0] = $start; $labels[$start] = $label
    $count = 0; $touchesEdge = $false
    while ($head -lt $tail) {
      $current = $queue[$head++]; $count++
      $cx = $current % $width; $cy = [math]::Floor($current / $width)
      if ($cx -eq 0 -or $cy -eq 0 -or $cx -eq $width - 1 -or $cy -eq $height - 1) { $touchesEdge = $true }
      foreach ($next in @(($current - 1), ($current + 1), ($current - $width), ($current + $width))) {
        if ($next -lt 0 -or $next -ge $length -or -not $opaque[$next] -or $labels[$next] -ne 0) { continue }
        $nx = $next % $width
        if ([math]::Abs($nx - $cx) -gt 1) { continue }
        $labels[$next] = $label; $queue[$tail++] = $next
      }
    }
    $components += [pscustomobject]@{ Label = $label; Count = $count; TouchesEdge = $touchesEdge }
  }
  $largest = ($components | Sort-Object Count -Descending | Select-Object -First 1).Label
  $keep = @{}
  foreach ($component in $components) {
    if ($component.Label -eq $largest -or (-not $component.TouchesEdge -and $component.Count -ge 18)) { $keep[$component.Label] = $true }
  }
  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      $position = $y * $width + $x
      if ($opaque[$position] -and -not $keep.ContainsKey($labels[$position])) {
        $color = $bitmap.GetPixel($x, $y)
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
      }
    }
  }
}

$modes = @('hover', 'swing', 'game', 'movie', 'running')
foreach ($mode in $modes) {
  $sheetPath = Join-Path $SheetRoot "$mode-$SheetSuffix"
  $outputDir = Join-Path $OutputRoot $mode
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  $sheet = [System.Drawing.Bitmap]::FromFile($sheetPath)
  try {
    for ($index = 0; $index -lt 12; $index++) {
      $column = $index % 4
      $row = [math]::Floor($index / 4)
      $left = [int][math]::Round($column * $sheet.Width / 4)
      $right = [int][math]::Round(($column + 1) * $sheet.Width / 4)
      $top = [int][math]::Round($row * $sheet.Height / 3)
      $bottom = [int][math]::Round(($row + 1) * $sheet.Height / 3)
      $cell = $sheet.Clone(
        [System.Drawing.Rectangle]::FromLTRB($left, $top, $right, $bottom),
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
      )
      try {
        Remove-NeighborBleed $cell
        $minX = $cell.Width; $minY = $cell.Height; $maxX = -1; $maxY = -1
        for ($y = 0; $y -lt $cell.Height; $y++) {
          for ($x = 0; $x -lt $cell.Width; $x++) {
            if ($cell.GetPixel($x, $y).A -gt 8) {
              if ($x -lt $minX) { $minX = $x }
              if ($x -gt $maxX) { $maxX = $x }
              if ($y -lt $minY) { $minY = $y }
              if ($y -gt $maxY) { $maxY = $y }
            }
          }
        }
        if ($maxX -lt $minX -or $maxY -lt $minY) { throw "Empty frame: $mode/$index" }
        $content = [System.Drawing.Rectangle]::FromLTRB($minX, $minY, $maxX + 1, $maxY + 1)
        $available = $FrameSize - 8
        $scale = [math]::Min($available / $content.Width, $available / $content.Height)
        $width = [int][math]::Round($content.Width * $scale)
        $height = [int][math]::Round($content.Height * $scale)
        $xOffset = [int][math]::Round(($FrameSize - $width) / 2)
        $yOffset = $FrameSize - $height - 4
        $frame = New-Object System.Drawing.Bitmap($FrameSize, $FrameSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
          $graphics = [System.Drawing.Graphics]::FromImage($frame)
          try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $target = New-Object System.Drawing.Rectangle($xOffset, $yOffset, $width, $height)
            $graphics.DrawImage($cell, $target, $content, [System.Drawing.GraphicsUnit]::Pixel)
          } finally { $graphics.Dispose() }
          $name = "$FramePrefix-{0:D2}.png" -f ($index + 1)
          $frame.Save((Join-Path $outputDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $frame.Dispose() }
      } finally { $cell.Dispose() }
    }
  } finally { $sheet.Dispose() }
}
