# Carrom

Run carrom singles or doubles fixtures under ICF / AICF laws. The scorer applies the rules and sends the live score to the OBS overlay.

## 1. Enable carrom for a tournament

1. Open **Platform Admin**.
2. Create a tournament and choose **Carrom** as the primary sport, or click the **Carrom** chip on an existing tournament.
3. Click **Carrom Rules** to confirm the format and limits. The defaults follow the ICF laws:
   - Singles or doubles.
   - A game ends at 25 points or after 8 boards. If the scores are level after the last board, an extra board is played.
   - Matches are best of 3 games.
   - The Queen is worth 3 points. It only counts while the board winner's score is 21 or less.
   - A board is worth at most 12 points.
   - Each stroke has a 15-second limit, and the breaker gets 3 attempts to break.
4. Click **Save Rules**. The rules are copied to the tournament, and the scorer and overlay pick them up straight away.

## 2. Add players and fixtures

Open **Carrom Scorer** from Platform Admin, or go to `/<tournament>/carrom/scorer/admin`.

- **Players / Pairs**: add one name for singles or two names for doubles. You can also set a short code, a colour and a logo or photo URL.
- **Fixtures**: pick side A and side B, then set the stage, the board number, the venue and an optional start time.
- **On air**: sets which fixture the OBS overlay follows.

## 3. Score a match

Click **Score** on a fixture.

1. **Toss**: choose who breaks first. The breaker plays white. Breaks then alternate:
   - Each new board is broken by the other side.
   - Game 2 is broken first by the other side.
   - Game 3 is broken first by the original breaker again.
2. Record each stroke for the player shown under **On strike**.

| Button | Meaning |
| --- | --- |
| +1 own carromman | The player pocketed one of their own carrommen and plays again. |
| No pocket · pass turn | Nothing was pocketed, so the turn passes to the opponent. |
| Queen pocketed | The Queen went in. It must be covered with an own carromman on this stroke or the next one, or it goes back to the centre. |
| Due (striker pocketed) | One own carromman comes back to the board. If none have been pocketed yet, the due is held until one is. |
| Foul | One penalty carromman comes back and the turn passes. |
| Technical foul | One penalty carromman comes back and the player keeps the turn. |
| Break attempt missed | Counts a missed break attempt. After the limit, the opponent takes the break. |

For strokes where several things happen at once, use **Detailed stroke**. Set the number of own and opponent carrommen pocketed, then tick Queen, Striker pocketed or Foul as needed.

The app works out every board result automatically:

- **Board won**: the player who clears their own carrommen scores 1 point for each opponent carromman left on the board. The Queen adds 3 points if that player covered it and their score is 21 or less.
- **Board lost by mistake**: pocketing your last carromman before the Queen is covered loses the board. So does pocketing your opponent's last carromman.
- **End of game**: the game finishes when a player reaches the target score, or after the last board. Then click **Start game N**. At this point the players change sides.
- **End of match**: when the match finishes, the fixture is marked completed and the result is saved.

To fix mistakes, use **Undo / Redo** in the header. Under **Umpire corrections** you can also switch who is on strike, or award a board directly.

## 4. Broadcast

- Add `/<tournament>/carrom/scorer/obs-overlay` to OBS as a **1920×1080 browser source**.
- By default the overlay shows the built-in **Walnut & Gold** scoreboard. It includes:
  - A wooden frame with a red felt score plate.
  - Live counts of the white and black carrommen left.
  - A Queen indicator and the current stroke clock.
  - A strip of board results for the current game.
  - Pop-up celebrations when the Queen is covered or a board, game or match is won.
- The colours, position and visible elements are set in **Carrom Admin › Broadcast**.
- To design your own layout, open **Scorecard Designer**. The carrom canvas starts from the Walnut & Gold template, and every element is a carrom widget you can move or restyle. Click **Set Active** to use your layout in the overlay.
