// ============================================================================
// ANALYTICS CAROUSEL COMPONENT
// Running carousel at bottom showing auction stats in real-time
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoldPlayers, useTeams, useAvailablePlayers, useUnsoldPlayers } from '../../store';
import './AnalyticsCarousel.css';

interface StatItem {
  id: string;
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}

export function AnalyticsCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const soldPlayers = useSoldPlayers();
  const teams = useTeams();
  const availablePlayers = useAvailablePlayers();
  const unsoldPlayers = useUnsoldPlayers();

  // Calculate analytics
  const analytics = useMemo(() => {
    // Top buys (highest sold amounts)
    const sortedBySold = [...soldPlayers].sort((a, b) => (b.soldAmount || 0) - (a.soldAmount || 0));
    const topBuys = sortedBySold.slice(0, 5);

    // Team spending
    const teamSpending = teams.map(team => ({
      name: team.name,
      spent: 100 - (team.remainingPurse || 100),
      players: team.playersBought || 0,
    })).sort((a, b) => b.spent - a.spent);

    // Most expensive player
    const mostExpensive = topBuys[0] || null;

    // Average sold price
    const avgPrice = soldPlayers.length > 0
      ? soldPlayers.reduce((sum, p) => sum + (p.soldAmount || 0), 0) / soldPlayers.length
      : 0;

    // Total money spent
    const totalSpent = soldPlayers.reduce((sum, p) => sum + (p.soldAmount || 0), 0);

    // Role breakdown
    const roleBreakdown: Record<string, number> = {};
    soldPlayers.forEach(p => {
      const role = p.role || 'Unknown';
      roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
    });

    return {
      topBuys,
      teamSpending,
      mostExpensive,
      avgPrice,
      totalSpent,
      roleBreakdown,
      soldCount: soldPlayers.length,
      unsoldCount: unsoldPlayers.length,
      remainingCount: availablePlayers.length,
    };
  }, [soldPlayers, teams, availablePlayers, unsoldPlayers]);

  // Generate stat items for carousel
  const statItems: StatItem[] = useMemo(() => {
    const items: StatItem[] = [
      {
        id: 'total-sold',
        icon: '🏆',
        label: 'Players Sold',
        value: `${analytics.soldCount}`,
      },
      {
        id: 'total-spent',
        icon: '💰',
        label: 'Total Spent',
        value: `₹${analytics.totalSpent.toFixed(1)}L`,
        highlight: true,
      },
      {
        id: 'avg-price',
        icon: '📊',
        label: 'Avg Price',
        value: `₹${analytics.avgPrice.toFixed(1)}L`,
      },
      {
        id: 'remaining',
        icon: '⏳',
        label: 'Remaining',
        value: `${analytics.remainingCount}`,
      },
      {
        id: 'unsold',
        icon: '❌',
        label: 'Unsold',
        value: `${analytics.unsoldCount}`,
      },
    ];

    // Add most expensive player
    if (analytics.mostExpensive) {
      items.push({
        id: 'top-buy',
        icon: '👑',
        label: 'Top Buy',
        value: `${analytics.mostExpensive.name} (₹${analytics.mostExpensive.soldAmount}L)`,
        highlight: true,
      });
    }

    // Add top spender team
    if (analytics.teamSpending.length > 0) {
      const topSpender = analytics.teamSpending[0];
      items.push({
        id: 'top-spender',
        icon: '🔥',
        label: 'Top Spender',
        value: `${topSpender.name} (₹${topSpender.spent.toFixed(1)}L)`,
      });
    }

    // Add role stats
    Object.entries(analytics.roleBreakdown).forEach(([role, count]) => {
      items.push({
        id: `role-${role}`,
        icon: role === 'Batsman' ? '🏏' : role === 'Bowler' ? '🎯' : role === 'All-Rounder' ? '⭐' : '🧤',
        label: role,
        value: `${count} sold`,
      });
    });

    // Add recent top buys
    analytics.topBuys.slice(0, 3).forEach((player, index) => {
      items.push({
        id: `top-${index}`,
        icon: index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉',
        label: player.name,
        value: `₹${player.soldAmount}L to ${player.teamName}`,
        highlight: index === 0,
      });
    });

    return items;
  }, [analytics]);

  // Auto-rotate carousel
  useEffect(() => {
    if (statItems.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % statItems.length);
    }, 4000); // Change every 4 seconds

    return () => clearInterval(interval);
  }, [statItems.length]);

  // Get visible items (show 5 at a time)
  const visibleCount = Math.min(5, statItems.length);
  const visibleItems = useMemo(() => {
    if (statItems.length <= visibleCount) return statItems;
    
    const items: StatItem[] = [];
    for (let i = 0; i < visibleCount; i++) {
      const index = (currentIndex + i) % statItems.length;
      items.push(statItems[index]);
    }
    return items;
  }, [statItems, currentIndex, visibleCount]);

  if (statItems.length === 0) {
    return null;
  }

  return (
    <div className="analytics-carousel">
      <div className="carousel-track">
        <AnimatePresence mode="popLayout">
          {visibleItems.map((item, index) => (
            <motion.div
              key={item.id}
              className={`carousel-item ${item.highlight ? 'highlight' : ''}`}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <span className="item-icon">{item.icon}</span>
              <span className="item-label">{item.label}</span>
              <span className="item-value">{item.value}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Progress indicators */}
      <div className="carousel-dots">
        {statItems.map((_, index) => (
          <button
            key={index}
            className={`carousel-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(index)}
            aria-label={`Go to stat ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default AnalyticsCarousel;
