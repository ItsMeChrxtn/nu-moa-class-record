# Opens a workbook in Excel (hidden, read-only), recalculates it, and saves each visible sheet
# as its own PDF using the sheet's print settings. Prints "sheet name<TAB>pdf path" per sheet.
param([Parameter(Mandatory)][string]$Xlsx, [Parameter(Mandatory)][string]$OutDir)

$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open($Xlsx, 0, $true)
  $excel.CalculateFull()
  $i = 0
  foreach ($ws in $wb.Worksheets) {
    if ($ws.Visible -ne -1) { continue } # hidden sheets are skipped
    $i++
    $pdf = Join-Path $OutDir ('{0:D2}.pdf' -f $i)
    try {
      $ws.ExportAsFixedFormat(0, $pdf)
      Write-Output "$($ws.Name)`t$pdf"
    } catch {
      # An empty sheet has nothing to print.
    }
  }
  $wb.Close($false)
} finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
