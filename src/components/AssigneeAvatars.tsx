import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Assignee } from '../models/types';
import { getInitials } from '../utils/helpers';
import { fontFamilies, fontSizes } from '../config/designTokens';

interface AssigneeAvatarsProps {
  assignees: Assignee[];
  maxDisplay?: number;
}

export const AssigneeAvatars: React.FC<AssigneeAvatarsProps> = ({
  assignees,
  maxDisplay = 3,
}) => {
  const avatarColors = ['#F1D7C2', '#CFE6DF', '#E7E1C6', '#D9D3E8', '#F0C9C9'];
  return (
    <View style={styles.container}>
      {assignees.slice(0, maxDisplay).map((assignee, index) => (
        <View
          key={index}
          style={[styles.avatar, { backgroundColor: avatarColors[index % avatarColors.length] }]}
        >
          {assignee.picture ? (
            <Image source={{ uri: assignee.picture }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.initial}>{getInitials(assignee.name)}</Text>
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginRight: 4,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: -6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  initial: {
    fontSize: fontSizes.xs,
    fontFamily: fontFamilies.bodyBold,
    color: '#2A2E2B',
  },
});
