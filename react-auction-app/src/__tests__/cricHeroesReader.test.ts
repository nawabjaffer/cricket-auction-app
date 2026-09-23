import { describe, expect, it } from 'vitest';
import { cricHeroesReader } from '../services/scoring/cricHeroesReader';

describe('cricHeroesReader live score parsing', () => {
  it('parses the modern live payload embedded in CricHeroes scorecard pages', () => {
    const raw = `
      <html>
        <body>
          <script>
            self.__next_f.push([1, "0:{\\"P\\":null,\\"c\\":[\\"\\",\\"scorecard\\",\\"27276893\\",\\"indoor-series\\",\\"fortner-boys-vs-wizards\\",\\"live\\\"],\\"team_a\\":{\\"id\\":14163861,\\"name\\":\\"FORTNER BOYS\\",\\"summary\\":\\"139/3\\",\\"innings\\":[{\\"team_id\\":14163861,\\"total_run\\":139,\\"total_wicket\\":3,\\"overs_played\\":\\"10.0\\\"}]},\\"team_b\\":{\\"id\\":14163918,\\"name\\":\\"WIZARDS\\",\\"summary\\":\\"19/1\\",\\"innings\\":[{\\"team_id\\":14163918,\\"total_run\\":19,\\"total_wicket\\":1,\\"overs_played\\":\\"1.2\\\"}]} }"]);
          </script>
        </body>
      </html>
    `;

    const embedded = (cricHeroesReader as any).extractEmbeddedJson(raw);
    expect(embedded).not.toBeNull();

    const snapshot = (cricHeroesReader as any).parse(raw, 'https://cricheroes.com/scorecard/27276893/indoor-series/fortner-boys-vs-wizards/live', '27276893');
    expect(snapshot.innings.length).toBe(2);
    expect(snapshot.innings[0].teamName).toContain('FORTNER');
    expect(snapshot.innings[1].teamName).toContain('WIZARDS');
    expect(snapshot.innings[0].runs).toBe(139);
    expect(snapshot.innings[1].runs).toBe(19);
  });
});
