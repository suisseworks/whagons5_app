import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { ThemeName } from '../models/types';
import { themeMetadata, getLightTheme, getDarkTheme, getPrimaryColor } from '../config/themes';

export const ThemesScreen: React.FC = () => {
  const navigation = useNavigation();
  const { themeName, setThemeName, isDarkMode, colors, primaryColor } = useTheme();

  const handleSelectTheme = (theme: ThemeName) => {
    setThemeName(theme);
    navigation.goBack();
  };

  const renderThemeCard = ({ item }: { item: typeof themeMetadata[0] }) => {
    const isSelected = item.id === themeName;
    const themeColors = isDarkMode ? getDarkTheme(item.id) : getLightTheme(item.id);
    const themePrimary = getPrimaryColor(item.id);

    const getIconComponent = () => {
      switch (item.icon) {
        case 'water':
          return <MaterialCommunityIcons name="water" size={40} color="#FFFFFF" />;
        case 'weather-sunset':
          return <MaterialCommunityIcons name="weather-sunset" size={40} color="#FFFFFF" />;
        case 'tree':
          return <MaterialCommunityIcons name="tree" size={40} color="#FFFFFF" />;
        default:
          return <MaterialIcons name="palette" size={40} color="#FFFFFF" />;
      }
    };

    return (
      <TouchableOpacity
        style={[
          styles.themeCard,
          { backgroundColor: themeColors.background },
          isSelected && { borderColor: themePrimary, borderWidth: 3 },
        ]}
        onPress={() => handleSelectTheme(item.id)}
      >
        {isSelected && (
          <View style={styles.checkmarkContainer}>
            <MaterialIcons name="check-circle" size={24} color={themePrimary} />
          </View>
        )}

        <View style={[styles.iconContainer, { backgroundColor: themePrimary }]}>
          {getIconComponent()}
        </View>

        <Text style={[styles.themeName, { color: isDarkMode ? '#FFFFFF' : '#212121' }]}>
          {item.name}
        </Text>

        <Text style={[styles.themeDescription, { color: isDarkMode ? '#FFFFFFB3' : '#757575' }]}>
          {item.description}
        </Text>

        <View style={styles.colorDots}>
          <View style={[styles.colorDot, { backgroundColor: themePrimary }]} />
          <View style={[styles.colorDot, { backgroundColor: getLightTheme(item.id).secondary }]} />
          <View
            style={[
              styles.colorDot,
              {
                backgroundColor: themeColors.surface,
                borderWidth: 1,
                borderColor: '#BDBDBD',
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Choose Theme</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={themeMetadata}
        renderItem={renderThemeCard}
        keyExtractor={item => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  themeCard: {
    width: '48%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  themeName: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
  },
  themeDescription: {
    marginTop: 4,
    fontSize: 12,
    textAlign: 'center',
  },
  colorDots: {
    flexDirection: 'row',
    marginTop: 8,
    justifyContent: 'center',
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginHorizontal: 3,
  },
});
