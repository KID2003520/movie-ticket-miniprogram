Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot "..\images\tab"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function Save-TabIcon([string]$fileName, [int]$colorArgb, [string]$type) {
  $size = 81
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $color = [System.Drawing.Color]::FromArgb($colorArgb)
  $pen = New-Object System.Drawing.Pen $color, 3.2
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $brush = New-Object System.Drawing.SolidBrush $color

  if ($type -eq 'home') {
    $g.DrawLines($pen, @(
      [System.Drawing.Point]::new(40, 16),
      [System.Drawing.Point]::new(18, 36),
      [System.Drawing.Point]::new(63, 36)
    ))
    $g.DrawLine($pen, 18, 36, 18, 62)
    $g.DrawLine($pen, 63, 36, 63, 62)
    $g.DrawLine($pen, 18, 62, 63, 62)
    $g.FillRectangle($brush, 34, 48, 13, 14)
  }
  elseif ($type -eq 'movie') {
    $g.DrawRectangle($pen, 22, 20, 38, 42)
    $g.DrawLine($pen, 22, 32, 60, 32)
    foreach ($i in 0..3) {
      $x = 26 + $i * 9
      $g.DrawLine($pen, $x, 20, ($x - 4), 12)
    }
    $g.FillEllipse($brush, 44, 42, 8, 8)
  }
  elseif ($type -eq 'cinema') {
    $g.DrawRectangle($pen, 20, 22, 42, 30)
    $g.DrawLine($pen, 28, 52, 54, 52)
    $g.DrawLine($pen, 40, 52, 40, 58)
    $g.DrawLine($pen, 32, 58, 48, 58)
    $g.FillRectangle($brush, 26, 28, 30, 18)
  }
  elseif ($type -eq 'user') {
    $g.DrawEllipse($pen, 30, 18, 22, 22)
    $g.DrawArc($pen, 18, 44, 46, 28, 180, 180)
  }

  $g.Dispose()
  $pen.Dispose()
  $brush.Dispose()
  $bmp.Save((Join-Path $dir $fileName), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$gray = 0xFF999999
$orange = 0xFFFF5533
foreach ($t in @('home', 'movie', 'cinema', 'user')) {
  Save-TabIcon "$t.png" $gray $t
  Save-TabIcon "$t-active.png" $orange $t
}
Write-Host "done"
