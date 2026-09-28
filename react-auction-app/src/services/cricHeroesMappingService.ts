import { onValue, ref, set, type Database } from 'firebase/database';
import type { CricHeroesNameMappings } from '../utils/cricHeroesMappings';
import { normalizeCricHeroesMappings } from '../utils/cricHeroesMappings';

class CricHeroesMappingService {
  private db: Database | null = null;
  private path = '';

  initialize(db: Database, scoringPath: string): void {
    this.db = db;
    this.path = `${scoringPath.replace(/\/$/, '')}/cricHeroes/nameMappings`;
  }

  private getDatabase(): Database {
    if (!this.db || !this.path) throw new Error('CricHeroesMappingService is not initialized');
    return this.db;
  }

  subscribe(callback: (mappings: CricHeroesNameMappings | null) => void): () => void {
    return onValue(ref(this.getDatabase(), this.path), snapshot => {
      callback(snapshot.exists() ? normalizeCricHeroesMappings(snapshot.val()) : null);
    });
  }

  async save(mappings: CricHeroesNameMappings): Promise<void> {
    await set(ref(this.getDatabase(), this.path), normalizeCricHeroesMappings(mappings));
  }
}

export const cricHeroesMappingService = new CricHeroesMappingService();
