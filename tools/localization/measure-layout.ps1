Add-Type -AssemblyName System.Drawing
$rows = Get-Content -LiteralPath 'local/layout-input.json' -Raw | ConvertFrom-Json
$graphics = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$result = foreach ($row in $rows) {
 $fontStyle = if($row.bold){[System.Drawing.FontStyle]::Bold}else{[System.Drawing.FontStyle]::Regular}
 $font = [System.Drawing.Font]::new($row.font, [single]$row.size, $fontStyle, [System.Drawing.GraphicsUnit]::Pixel)
 $plain = $row.text -replace '<[^>]+>', '' -replace '\{\d+\}', '99'
 $width = 0
 foreach($line in ($plain -split "`n")){ $w=$graphics.MeasureString($line,$font,9999,[System.Drawing.StringFormat]::GenericTypographic).Width; if($w -gt $width){$width=$w} }
 $font.Dispose()
 $row | Add-Member -NotePropertyName estimatedEnglishWidth -NotePropertyValue ([Math]::Round($width,1))
 $row | Add-Member -NotePropertyName widthRatio -NotePropertyValue ([Math]::Round($width/[Math]::Max(1,$row.width),2))
 $row
}
$graphics.Dispose()
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath 'tools/localization/layout-audit.json'
$result | Where-Object { $_.widthRatio -gt 1.08 -and $_.kind -eq 'cc.Label'} | Sort-Object widthRatio -Descending | Select-Object f,i,path,text,size,width,parentWidth,estimatedEnglishWidth,widthRatio,overflow | Format-Table -AutoSize
