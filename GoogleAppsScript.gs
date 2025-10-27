// Google Apps Script for Cricket Auction App
// This script handles updating sold and unsold players in Google Sheets

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'updateSoldPlayer') {
      return updateSoldPlayer(data);
    } else if (action === 'updateUnsoldPlayer') {
      return updateUnsoldPlayer(data);
    } else if (action === 'moveUnsoldToSold') {
      return moveUnsoldToSold(data);
    } else if (action === 'clearAuction') {
      return clearAuction();
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Unknown action'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Update sold player in Sold Players sheet
function updateSoldPlayer(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const soldSheet = ss.getSheetByName('Sold Players');
  const teamsSheet = ss.getSheetByName('Teams');
  
  if (!soldSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Sold Players sheet not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Column order based on config.js soldPlayers mapping:
  // 0=ID, 1=Name, 2=Role, 3=Age, 4=Matches, 5=BestFigures, 6=TeamName, 7=SoldAmount, 8=BasePrice, 9=ImageUrl
  soldSheet.appendRow([
    data.playerId,           // Column A: ID
    data.playerName,         // Column B: Name
    data.role,               // Column C: Role
    data.age || '',          // Column D: Age
    data.matches,            // Column E: Matches
    data.battingBest || data.bowlingBest || 'N/A', // Column F: Best Figures
    data.teamName,           // Column G: Team Name
    data.soldPrice,          // Column H: Sold Amount
    data.basePrice,          // Column I: Base Price
    data.imageUrl || ''      // Column J: Image URL
  ]);
  
  // Update Teams sheet if team data is provided
  if (teamsSheet && data.teamPlayersBought !== undefined) {
    updateTeamStats(teamsSheet, data.teamName, {
      playersBought: data.teamPlayersBought,
      u19PlayersBought: data.teamU19PlayersBought,
      remainingPlayers: data.teamRemainingPlayers,
      remainingPurse: data.teamRemainingPurse,
      highestBid: data.teamHighestBid
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Player added to Sold Players and team stats updated'
  })).setMimeType(ContentService.MimeType.JSON);
}

// Helper function to update team statistics
function updateTeamStats(teamsSheet, teamName, stats) {
  const teamsData = teamsSheet.getDataRange().getValues();
  
  // Find the team row (skip header row)
  for (let i = 1; i < teamsData.length; i++) {
    if (teamsData[i][0] === teamName) { // Column A is team name
      // Column mappings based on new structure:
      // 0=Name, 1=LogoUrl, 2=PlayersBought, 3=U19PlayersBought, 4=RemainingPlayers,
      // 5=TotalPlayerThreshold, 6=AllocatedAmount, 7=RemainingPurse, 8=HighestBid, 9=Captain
      
      const row = i + 1; // Sheet rows are 1-indexed
      
      if (stats.playersBought !== undefined) {
        teamsSheet.getRange(row, 3).setValue(stats.playersBought); // Column C
      }
      if (stats.u19PlayersBought !== undefined) {
        teamsSheet.getRange(row, 4).setValue(stats.u19PlayersBought); // Column D
      }
      if (stats.remainingPlayers !== undefined) {
        teamsSheet.getRange(row, 5).setValue(stats.remainingPlayers); // Column E
      }
      if (stats.remainingPurse !== undefined) {
        teamsSheet.getRange(row, 8).setValue(stats.remainingPurse); // Column H
      }
      if (stats.highestBid !== undefined) {
        teamsSheet.getRange(row, 9).setValue(stats.highestBid); // Column I
      }
      
      Logger.log('Updated team stats for ' + teamName + ': ' + JSON.stringify(stats));
      break;
    }
  }
}

// Update unsold player in Unsold Players sheet
function updateUnsoldPlayer(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let unsoldSheet = ss.getSheetByName('Unsold Players');
  
  // Create sheet if it doesn't exist
  if (!unsoldSheet) {
    unsoldSheet = ss.insertSheet('Unsold Players');
    // Add headers
    unsoldSheet.appendRow([
      'Player ID',
      'Name',
      'Role',
      'Age',
      'Matches',
      'Best Figures',
      'Base Price',
      'Round',
      'Timestamp',
      'Image URL'
    ]);
  }
  
  // Check if player already exists (update instead of adding duplicate)
  const sheetData = unsoldSheet.getDataRange().getValues();
  let playerRow = -1;
  for (let i = 1; i < sheetData.length; i++) {
    if (sheetData[i][0] == data.playerId) {
      playerRow = i + 1;
      break;
    }
  }
  
  // Column order based on config.js unsoldPlayers mapping:
  // 0=ID, 1=Name, 2=Role, 3=Age, 4=Matches, 5=BestFigures, 6=BasePrice, 7=Round, 8=UnsoldDate, 9=ImageUrl
  const rowData = [
    data.playerId,           // Column A: ID
    data.playerName,         // Column B: Name
    data.role,               // Column C: Role
    data.age || '',          // Column D: Age
    data.matches,            // Column E: Matches
    data.battingBest || data.bowlingBest || 'N/A', // Column F: Best Figures
    data.basePrice,          // Column G: Base Price
    data.round || 'Round 1', // Column H: Round
    new Date(),              // Column I: Timestamp
    data.imageUrl || ''      // Column J: Image URL
  ];
  
  if (playerRow > 0) {
    // Update existing row
    unsoldSheet.getRange(playerRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Add new row
    unsoldSheet.appendRow(rowData);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Player added to Unsold Players'
  })).setMimeType(ContentService.MimeType.JSON);
}

// Move player from Unsold to Sold (when unsold player is sold in second round)
function moveUnsoldToSold(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const unsoldSheet = ss.getSheetByName('Unsold Players');
  const soldSheet = ss.getSheetByName('Sold Players');
  const teamsSheet = ss.getSheetByName('Teams');
  
  if (!unsoldSheet || !soldSheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Required sheets not found'
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Find and remove from Unsold Players
  const unsoldData = unsoldSheet.getDataRange().getValues();
  for (let i = 1; i < unsoldData.length; i++) {
    if (unsoldData[i][0] == data.playerId) {
      unsoldSheet.deleteRow(i + 1);
      break;
    }
  }
  
  // Add to Sold Players with correct column order
  // Column order: ID, Name, Role, Age, Matches, BestFigures, TeamName, SoldAmount, BasePrice, ImageUrl
  soldSheet.appendRow([
    data.playerId,           // Column A: ID
    data.playerName,         // Column B: Name
    data.role,               // Column C: Role
    data.age || '',          // Column D: Age
    data.matches,            // Column E: Matches
    data.battingBest || data.bowlingBest || 'N/A', // Column F: Best Figures
    data.teamName,           // Column G: Team Name
    data.soldPrice,          // Column H: Sold Amount
    data.basePrice,          // Column I: Base Price
    data.imageUrl || ''      // Column J: Image URL
  ]);
  
  // Update Teams sheet if team data is provided
  if (teamsSheet && data.teamPlayersBought !== undefined) {
    updateTeamStats(teamsSheet, data.teamName, {
      playersBought: data.teamPlayersBought,
      u19PlayersBought: data.teamU19PlayersBought,
      remainingPlayers: data.teamRemainingPlayers,
      remainingPurse: data.teamRemainingPurse,
      highestBid: data.teamHighestBid
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Player moved from Unsold to Sold and team stats updated'
  })).setMimeType(ContentService.MimeType.JSON);
}

// Clear auction data (reset both Sold and Unsold sheets)
function clearAuction() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const soldSheet = ss.getSheetByName('Sold Players');
  const unsoldSheet = ss.getSheetByName('Unsold Players');
  
  // Clear Sold Players (keep header)
  if (soldSheet && soldSheet.getLastRow() > 1) {
    soldSheet.deleteRows(2, soldSheet.getLastRow() - 1);
  }
  
  // Clear Unsold Players (keep header)
  if (unsoldSheet && unsoldSheet.getLastRow() > 1) {
    unsoldSheet.deleteRows(2, unsoldSheet.getLastRow() - 1);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Auction data cleared'
  })).setMimeType(ContentService.MimeType.JSON);
}
