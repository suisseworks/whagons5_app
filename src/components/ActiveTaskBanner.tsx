import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TaskItem } from '../models/types';
import { statusColor } from '../utils/helpers';

interface ActiveTaskBannerProps {
  task: TaskItem;
  onDone: () => void;
  onClear: () => void;
}

export const ActiveTaskBanner: React.FC<ActiveTaskBannerProps> = ({
  task,
  onDone,
  onClear,
}) => {
  return (
    <View style={[styles.container, { borderLeftColor: statusColor(task.status) }]}>
      <MaterialIcons name="play-circle-fill" size={24} color="#43A047" />
      <View style={styles.content}>
        <Text style={styles.label}>Working on</Text>
        <Text style={styles.title} numberOfLines={1}>
          {task.title}
        </Text>
      </View>
      <TouchableOpacity onPress={onDone} style={styles.button}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onClear} style={styles.closeButton}>
        <MaterialIcons name="close" size={24} color="#757575" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderLeftWidth: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  content: {
    flex: 1,
    marginLeft: 10,
  },
  label: {
    fontSize: 12,
    color: '#757575',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#212121',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#14B7A3',
  },
  closeButton: {
    padding: 4,
  },
});
