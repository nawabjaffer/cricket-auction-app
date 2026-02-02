// ============================================================================
// ANALYTICS CAROUSEL COMPONENT - Running Marquee Style
// Running text from left to right showing real-time auction stats
// ============================================================================

import { useMemo } from 'react';
import { useSoldPlayers, useTeams, useAvailablePlayers, useUnsoldPlayers } from '../../store';
import './AnalyticsCarousel.css';

interface AnalyticsCarouselProps {
  visible?: boolean;
}

export function AnalyticsCarousel({ visible = true }: AnalyticsCarouselProps) {
  const soldPlayers = useSoldPlayers();
  const teams = useTeams();
  const availablePlayers = useAvailablePlayers();
  const unsoldPlayers = useUnsoldPlayers();

  // Calculate analytics and build marquee text
  const marqueeText = useMemo(() => {
    const items: string[] = [];

    // Total stats
    const totalPlayers = soldPlayers.length + unsoldPlayers.length + availablePlayers.length;
    items.push(`AUCTION LIVE`);
    items.push(`${soldPlayers.length}/${totalPlayers} Players Sold`);

    // Total money spent
    const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.soldAmount || 0), 0);
    items.push(`Total: ₹${totalSpent.toFixed(1)}L Spent`);

    // Average price
    if (soldPlayers.length > 0) {
      const avgPrice = totalSpent / soldPlayers.length;
      items.push(`Avg Price: ₹${avgPrice.toFixed(1)}L`);
    }

    // Top buy
    const sortedBySold = [...soldPlayers].sort((a, b) => (b.soldAmount || 0) - (a.soldAmount || 0));
    if (sortedBySold.length > 0) {
      const top = sortedBySold[0];
      items.push(`Top Buy: ${top.name} (₹${top.soldAmount}L to ${top.teamName})`);
    }

    // Second highest
    if (sortedBySold.length > 1) {
      const second = sortedBySold[1];
      items.push(`#2: ${second.name} (₹${second.soldAmount}L)`);
    }

    // Third highest
    if (sortedBySold.length > 2) {
      const third = sortedBySold[2];
      items.push(`#3: ${third.name} (₹${third.soldAmount}L)`);
    }

    // Team spending stats
    const teamSpending = teams
      .map(team => ({
        name: team.name,
        spent: 100 - (team.remainingPurse || 100),
        players: team.playersBought || 0,
        remaining: team.remainingPurse || 100,
      }))
      .sort((a, b) => b.spent - a.spent);

    // Top spender team
    if (teamSpending.length > 0 && teamSpending[0].spent > 0) {
      const top = teamSpending[0];
      items.push(`Top Spender: ${top.name} (₹${top.spent.toFixed(1)}L for ${top.players} players)`);
    }

    // Team with most players
    const byPlayers = [...teamSpending].sort((a, b) => b.players - a.players);
    if (byPlayers.length > 0 && byPlayers[0].players > 0) {
      items.push(`Most Players: ${byPlayers[0].name} (${byPlayers[0].players})`);
    }

    // Remaining and unsold counts
    items.push(`${availablePlayers.length} Remaining`);
    if (unsoldPlayers.length > 0) {
      items.push(`${unsoldPlayers.length} Unsold`);
    }

    // Role breakdown
    const roleBreakdown: Record<string, number> = {};
    soldPlayers.forEach(p => {
      const role = p.role || 'Unknown';
      roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    });

    Object.entries(roleBreakdown).forEach(([role, count]) => {
      items.push(`${count} ${role}${count > 1 ? 's' : ''} Sold`);
    });

    // Recent sales (last 3)
    if (soldPlayers.length > 0) {
      const recent = soldPlayers.slice(-3).reverse();
      recent.forEach(p => {
        items.push(`${p.name} → ${p.teamName} (₹${p.soldAmount}L)`);
      });
    }

    return items;
  }, [soldPlayers, teams, availablePlayers, unsoldPlayers]);

  if (!visible) return null;

  // Duplicate text for seamless loop
  const displayText = marqueeText.join('   •   ');

  return (
    <div className="analytics-carousel-marquee">
      <div className="marquee-track">
        <div className="marquee-content">
          <span className="marquee-text">{displayText}</span>
          <span className="marquee-text">{displayText}</span>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsCarousel;
