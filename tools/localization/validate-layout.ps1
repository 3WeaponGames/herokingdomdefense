Add-Type -AssemblyName System.Drawing
$rows=Get-Content local/final-layout-input.json -Raw|ConvertFrom-Json
$g=[System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$results=foreach($r in $rows){
 if(-not $r.fit){continue}
 $size=if($r.fit.fontSize){[double]$r.fit.fontSize}else{[double]$r.size}
 $width=[double]$r.fit.width
 $plain=$r.text -replace '<[^>]+>','' -replace '\{\d+\}','99'
 $fontStyle=if($r.bold){[System.Drawing.FontStyle]::Bold}else{[System.Drawing.FontStyle]::Regular}
 $maxLines=if($r.fit.maxLines){$r.fit.maxLines}else{1}
 $fitSize=$size
 $count=1
 while($fitSize -ge 12){
  $font=[System.Drawing.Font]::new($r.font,[single]$fitSize,$fontStyle,[System.Drawing.GraphicsUnit]::Pixel)
  $count=0
  foreach($line in ($plain -split "`n")){
   if(-not $r.fit.wrap){$count++;if($g.MeasureString($line,$font,9999,[System.Drawing.StringFormat]::GenericTypographic).Width -gt $width){$count=$maxLines+1;break}}
   else{
    $count++;$current=''
    foreach($word in ($line -split ' ')){
     $next=if($current){$current+' '+$word}else{$word}
     if($g.MeasureString($next,$font,9999,[System.Drawing.StringFormat]::GenericTypographic).Width -gt $width){if($current){$count++;$current=$word}else{$count=$maxLines+1;break}}else{$current=$next}
    }
   }
  }
  $font.Dispose()
  if($count -le $maxLines){break}
  $fitSize--
 }
 [pscustomobject]@{asset=$r.f;component=$r.i;key=$r.key;path=$r.path;en=$r.text;maxLines=$maxLines;estimatedLines=$count;sourceFont=$size;estimatedFitFont=$fitSize;screenFont375=[Math]::Round($fitSize*$r.scale*.5,1);width=$width;height=$r.fit.height}
}
$g.Dispose()
[pscustomobject]@{note='Static font measurements are estimates; final Cocos visual review is required. 375px viewport over 750px design width.';labels=$results;smallTextReview=@($results|Where-Object{$_.screenFont375 -lt 9})}|ConvertTo-Json -Depth 8|Set-Content tools/localization/label-fit-audit.json
$results|Where-Object{$_.screenFont375 -lt 9}|Select-Object path,en,estimatedFitFont,screenFont375,width,maxLines|ConvertTo-Json -Depth 3
