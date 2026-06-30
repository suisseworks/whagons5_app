import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { TaskFindingsTab } from '../components/TaskFindingsTab';
import { useTheme } from '../context/ThemeContext';
import type { RootStackParamList } from '../models/types';

type TaskFindingDetailRouteProp = RouteProp<RootStackParamList, 'TaskFindingDetail'>;
type TaskFindingDetailNavProp = NativeStackNavigationProp<RootStackParamList, 'TaskFindingDetail'>;

export const TaskFindingDetailScreen: React.FC = () => {
  const navigation = useNavigation<TaskFindingDetailNavProp>();
  const route = useRoute<TaskFindingDetailRouteProp>();
  const { colors, primaryColor, isDarkMode } = useTheme();
  const { taskId, taskName, findingId, readOnly } = route.params;

  return (
    <TaskFindingsTab
      taskId={taskId}
      taskName={taskName}
      readOnly={readOnly}
      colors={colors}
      primaryColor={primaryColor}
      isDarkMode={isDarkMode}
      detailOnly
      initialFindingId={findingId}
      onClose={() => navigation.goBack()}
    />
  );
};
