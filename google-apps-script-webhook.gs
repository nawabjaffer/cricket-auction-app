/**
 * Google Apps Script Webhook for Cricket Auction
 * 
 * HOW TO DEPLOY:
 * 1. Open your Google Spreadsheet
 * 2. Go to Extensions > Apps Script
 * 3. Delete any existing code and paste this entire script
 * 4. Click "Deploy" > "New deployment"
 * 5. Select type: "Web app"
 * 6. Execute as: "Me"
 * 7. Who has access: "Anyone"
 * 8. Click "Deploy"
 * 9. Copy the Web App URL and update it in your HTML file
 */

function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    console.log('Received data:', data);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Add sold player to "Sold Players" sheet
    addSoldPlayer(ss, data);
    
    // 2. Update Teams sheet (deduct balance, update counts, highest bid)
    updateTeamSheet(ss, data);
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Player sold and team updated successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Error:', error);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add sold player data to "Sold Players" sheet
 */
function addSoldPlayer(ss, data) {
  let soldSheet = ss.getSheetByName('Sold Players');
  
  // Create sheet if it doesn't exist
  if (!soldSheet) {
    soldSheet = ss.insertSheet('Sold Players');
    // Add headers
    soldSheet.appendRow([
      'Player ID',
      'Name',
      'Role',
      'Age',
      'Matches',
      'Best Figures',
      'Sold Amount',
      'Team Name',
      'Sold Date'
    ]);
  }
  
  // Add the sold player data
  soldSheet.appendRow([
    data.id,
    data.name,
    data.role,
    data.age,
    data.matches,
    data.bestFigures,
    data.soldAmount,
    data.teamName,
    new Date(data.soldDate)
  ]);
  
  console.log('Added player to Sold Players sheet');
}

/**
 * Update Teams sheet with new values
 */
function updateTeamSheet(ss, data) {
  const teamsSheet = ss.getSheetByName('Teams');
  
  if (!teamsSheet) {
    throw new Error('Teams sheet not found');
  }
  
  // Get all team data
  const teamsData = teamsSheet.getDataRange().getValues();
  
  // Find the row with the matching team name (row 0 is headers)
  let teamRowIndex = -1;
  for (let i = 1; i < teamsData.length; i++) {
    if (teamsData[i][0] === data.teamName) { // Column A is Team Name
      teamRowIndex = i;
      break;
    }
  }
  
  if (teamRowIndex === -1) {
    throw new Error('Team not found: ' + data.teamName);
  }
  
  // Update the team row (1-indexed for Sheets API)
  const sheetRow = teamRowIndex + 1;
  
  // Column mapping:
  // A(1) = Team Name
  // B(2) = Team Logo URL
  // C(3) = Player Bought
  // D(4) = Remaining Players
  // E(5) = Allocated Amount
  // F(6) = Remaining Purse
  // G(7) = Highest Bid Value
  // H(8) = Captain
  
  // Update Player Bought (Column C)
  teamsSheet.getRange(sheetRow, 3).setValue(data.teamPlayersBought);
  
  // Update Remaining Players (Column D)
  teamsSheet.getRange(sheetRow, 4).setValue(data.teamRemainingPlayers);
  
  // Update Remaining Purse (Column F)
  teamsSheet.getRange(sheetRow, 6).setValue(data.teamRemainingPurse);
  
  // Update Highest Bid Value (Column G)
  teamsSheet.getRange(sheetRow, 7).setValue(data.teamHighestBid);
  
  console.log('Updated team:', data.teamName);
  console.log('Players Bought:', data.teamPlayersBought);
  console.log('Remaining Purse:', data.teamRemainingPurse);
  console.log('Highest Bid:', data.teamHighestBid);
}

/**
 * Test function - you can run this from the Apps Script editor to test
 */
function testWebhook() {
  const testData = {
    id: 'P001',
    name: 'Test Player',
    role: 'Batsman',
    age: '25',
    matches: '10',
    bestFigures: '5/30',
    soldAmount: 5000,
    teamName: 'Mumbai Indians',
    soldDate: new Date().toISOString(),
    teamPlayersBought: 4,
    teamRemainingPlayers: 7,
    teamRemainingPurse: 80000,
    teamHighestBid: 5000
  };
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  addSoldPlayer(ss, testData);
  updateTeamSheet(ss, testData);
  
  Logger.log('Test completed successfully');
}
