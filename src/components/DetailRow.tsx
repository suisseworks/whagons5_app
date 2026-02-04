import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface DetailRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}

export const DetailRow: React.FC<DetailRowProps> = ({ icon, label, value }) => {
  return (
    <View style={styles.container}>
      <MaterialIcons name={icon} size={20} color="#757575" />
      <View style={styles.textContainer}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textContainer: {
    marginLeft: 12,
  },
  label: {
    fontSize: 12,
    color: '#757575',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
    marginTop: 2,
  },
});
