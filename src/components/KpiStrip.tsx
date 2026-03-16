/**
 * KpiStrip – Horizontally scrollable row of compact KPI metric cards.
 *
 * Designed to sit in the task list header and scroll away with the list.
 * Matches the visual style of the web client's workspace KPI cards.
 */

import React, { memo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { KpiComputedCard } from '../models/types';
import { fontFamilies, fontSizes, radius, spacing } from '../config/designTokens';
import Svg, { Polyline, Circle } from 'react-native-svg';

// ---------------------------------------------------------------------------
// Mini Sparkline (for trend cards)
// ---------------------------------------------------------------------------

const TrendSparkline = memo(({ data, color }: { data: number[]; color: string }) => {
  if (!data || data.length < 2) return null;

  const width = 48;
  const height = 20;
  const max = Math.max(...data, 1);
  const points = data
    .map((val, idx) => {
      const x = (idx / Math.max(data.length - 1, 1)) * width;
      const y = height - (val / max) * (height - 2) - 1; // 1px padding top/bottom
      return `${x},${y}`;
    })
    .join(' ');
  const lastX = width;
  const lastY = height - (data[data.length - 1] / max) * (height - 2) - 1;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={lastX} cy={lastY} r="2" fill={color} />
    </Svg>
  );
});

// ---------------------------------------------------------------------------
// Single KPI Card
// ---------------------------------------------------------------------------

interface KpiMiniCardProps {
  card: KpiComputedCard;
  isDarkMode: boolean;
  cardBackground: string;
  borderColor: string;
  textColor: string;
  textSecondary: string;
}

const KpiMiniCard = memo(({
  card,
  isDarkMode,
  cardBackground,
  borderColor,
  textColor,
  textSecondary,
}: KpiMiniCardProps) => {
  const iconBgColor = `${card.iconColor}18`; // 10% opacity

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBackground,
          borderColor,
        },
      ]}
    >
      <View style={styles.cardContent}>
        {/* Icon + Label row */}
        <View style={styles.cardTopRow}>
          <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
            <MaterialIcons
              name={card.iconName as any}
              size={14}
              color={card.iconColor}
            />
          </View>
          <Text
            style={[styles.cardLabel, { color: textSecondary }]}
            numberOfLines={1}
          >
            {card.label.toUpperCase()}
          </Text>
        </View>

        {/* Value + optional sparkline */}
        <View style={styles.cardValueRow}>
          <Text
            style={[styles.cardValue, { color: textColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {card.value}
          </Text>
          {card.trendData && card.trendData.length >= 2 && (
            <TrendSparkline data={card.trendData} color={card.iconColor} />
          )}
        </View>

        {/* Helper text */}
        {card.helperText ? (
          <Text
            style={[styles.cardHelper, { color: textSecondary }]}
            numberOfLines={1}
          >
            {card.helperText}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// KpiStrip
// ---------------------------------------------------------------------------

interface KpiStripProps {
  cards: KpiComputedCard[];
}

export const KpiStrip: React.FC<KpiStripProps> = memo(({ cards }) => {
  const { colors, isDarkMode } = useTheme();

  if (cards.length === 0) return null;

  const cardBackground = isDarkMode
    ? 'rgba(31, 36, 34, 0.7)'
    : 'rgba(255, 255, 255, 0.85)';
  const borderColor = isDarkMode
    ? 'rgba(255, 255, 255, 0.08)'
    : 'rgba(0, 0, 0, 0.06)';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.stripContent}
    >
      {cards.map(card => (
        <KpiMiniCard
          key={card.id}
          card={card}
          isDarkMode={isDarkMode}
          cardBackground={cardBackground}
          borderColor={borderColor}
          textColor={colors.text}
          textSecondary={colors.textSecondary}
        />
      ))}
    </ScrollView>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  strip: {
    marginBottom: spacing.sm,
  },
  stripContent: {
    gap: spacing.xs,
    paddingRight: spacing.xs,
  },
  card: {
    minWidth: 120,
    maxWidth: 160,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardContent: {
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 9,
    fontFamily: fontFamilies.bodySemibold,
    letterSpacing: 0.5,
    flex: 1,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  cardValue: {
    fontSize: fontSizes.lg,
    fontFamily: fontFamilies.displaySemibold,
    flexShrink: 1,
  },
  cardHelper: {
    fontSize: 10,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 1,
  },
});
