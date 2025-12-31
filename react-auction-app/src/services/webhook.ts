// ============================================================================
// WEBHOOK SERVICE - Server Communication Layer
// Handles all webhook calls to Google Apps Script
// ============================================================================

import type { Player, Team } from '../types';
import { activeConfig } from '../config';

export interface WebhookPayload {
  action: 'updateSoldPlayer' | 'updateUnsoldPlayer' | 'moveUnsoldToSold' | 'clearAuction';
  data?: Record<string, unknown>;
}

export interface SoldPlayerPayload {
  playerId: string;
  playerName: string;
  imageUrl: string;
  role: string;
  age: number | null;
  matches: string;
  bestFigures: string;
  basePrice: number;
  soldAmount: number;
  teamName: string;
  timestamp: string;
}

export interface UnsoldPlayerPayload {
  playerId: string;
  playerName: string;
  imageUrl: string;
  role: string;
  age: number | null;
  matches: string;
  bestFigures: string;
  basePrice: number;
  round: string;
  timestamp: string;
}

export interface MoveUnsoldToSoldPayload {
  playerId: string;
  soldAmount: number;
  teamName: string;
  timestamp: string;
}

/**
 * Webhook Service for Google Apps Script Communication
 * Handles CRUD operations via POST requests
 */
class WebhookService {
  private get webhookUrl(): string {
    return activeConfig.webhook.url;
  }

  /**
   * Generic webhook call with error handling
   */
  private async callWebhook<T>(action: string, data: T): Promise<{ success: boolean; error?: string }> {
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'no-cors', // Google Apps Script requires no-cors
        body: JSON.stringify({
          action,
          data,
        }),
      });

      // With no-cors, we can't read the response, so we assume success
      console.log(`[Webhook] ${action} call completed`);
      return { success: true };
    } catch (error) {
      console.error(`[Webhook] ${action} failed:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Mark a player as sold
   */
  async updateSoldPlayer(player: Player, soldAmount: number, team: Team): Promise<{ success: boolean; error?: string }> {
    const payload: SoldPlayerPayload = {
      playerId: player.id,
      playerName: player.name,
      imageUrl: player.imageUrl,
      role: player.role,
      age: player.age,
      matches: player.matches,
      bestFigures: player.battingBestFigures || player.bowlingBestFigures || 'N/A',
      basePrice: player.basePrice,
      soldAmount,
      teamName: team.name,
      timestamp: new Date().toISOString(),
    };

    console.log('[Webhook] Updating sold player:', payload);
    return this.callWebhook('updateSoldPlayer', payload);
  }

  /**
   * Mark a player as unsold
   */
  async updateUnsoldPlayer(player: Player, round: string = 'Round 1'): Promise<{ success: boolean; error?: string }> {
    const payload: UnsoldPlayerPayload = {
      playerId: player.id,
      playerName: player.name,
      imageUrl: player.imageUrl,
      role: player.role,
      age: player.age,
      matches: player.matches,
      bestFigures: player.battingBestFigures || player.bowlingBestFigures || 'N/A',
      basePrice: player.basePrice,
      round,
      timestamp: new Date().toISOString(),
    };

    console.log('[Webhook] Updating unsold player:', payload);
    return this.callWebhook('updateUnsoldPlayer', payload);
  }

  /**
   * Move unsold player to sold (Round 2)
   */
  async moveUnsoldToSold(player: Player, soldAmount: number, team: Team): Promise<{ success: boolean; error?: string }> {
    const payload: MoveUnsoldToSoldPayload = {
      playerId: player.id,
      soldAmount,
      teamName: team.name,
      timestamp: new Date().toISOString(),
    };

    console.log('[Webhook] Moving unsold to sold:', payload);
    return this.callWebhook('moveUnsoldToSold', payload);
  }

  /**
   * Clear all auction data (reset)
   */
  async clearAuction(): Promise<{ success: boolean; error?: string }> {
    console.log('[Webhook] Clearing auction data');
    return this.callWebhook('clearAuction', { timestamp: new Date().toISOString() });
  }
}

export const webhookService = new WebhookService();
