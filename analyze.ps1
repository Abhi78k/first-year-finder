$lines = Get-Content '.\Timetable_Report__5_.csv' | Select-Object -Skip 1
$venues = @{}
foreach($line in $lines) {
    if($line -match '^B\.E/B\.Tech ACY 2026-27 ODD_1st Sem') {
        # Extract venue - it's the 19th column (0-indexed: 18)
        # Use proper CSV parsing for lines with quotes
        $parts = $line -split ','
        # Venue is near the end - let's find it
        $venueIdx = 18
        # Handle quoted fields - reconstruct if needed
        $venue = $parts[$venueIdx]
        if($venue -and $venue -ne '') {
            $venues[$venue.Trim()] = $true
        }
    }
}
Write-Host "=== Unique Venues ==="
$venues.Keys | Sort-Object
