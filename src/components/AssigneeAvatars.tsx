import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getInitials } from '../utils/helpers';

interface AssigneeAvatarsProps {
  assignees: string[];
  maxDisplay?: number;
}

export const AssigneeAvatars: React.FC<AssigneeAvatarsProps> = ({
  assignees,
  maxDisplay = 3,
}) => {
  return (
    <View style={styles.container}>
      {assignees.slice(0, maxDisplay).map((name, index) => (
        <View key={index} style={styles.avatar}>
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
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  initial: {
    fontSize: 11,
    fontWeight: '700',
    color: '#212121',
  },
});
