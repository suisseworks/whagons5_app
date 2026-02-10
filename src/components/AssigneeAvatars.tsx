import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getInitials } from '../utils/helpers';
import { fontFamilies, fontSizes } from '../config/designTokens';

interface AssigneeAvatarsProps {
  assignees: string[];
  maxDisplay?: number;
}

export const AssigneeAvatars: React.FC<AssigneeAvatarsProps> = ({
  assignees,
  maxDisplay = 3,
}) => {
  const avatarColors = ['#F1D7C2', '#CFE6DF', '#E7E1C6', '#D9D3E8', '#F0C9C9'];
  return (
    <View style={styles.container}>
      {assignees.slice(0, maxDisplay).map((name, index) => (
        <View
          key={index}
          style={[styles.avatar, { backgroundColor: avatarColors[index % avatarColors.length] }]}
        >
          <Text style={styles.initial}>{getInitials(name)}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  initial: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: '#2A2E2B',
  },
});
