import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  StatusBar,
  StyleSheet,
  Dimensions,
  Platform,
  Keyboard,
  KeyboardEvent,
  ScrollView,
  KeyboardAvoidingView,
  Modal
} from 'react-native';
import { format, differenceInSeconds } from 'date-fns';
import { ar } from 'date-fns/locale';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationService from './src/utils/notificationService';

interface Task {
  id: number;
  title: string;
  description?: string;
  completed: boolean;
  deadline: Date;
  createdAt: Date;
  priority: 'low' | 'medium' | 'high';
  isStarred: boolean;
  reminder: number; // وقت التذكير بالدقائق قبل الموعد
  repeats?: 'daily' | 'weekly' | 'monthly' | null; // تكرار المهمة
  expired?: boolean; // حالة انتهاء المهمة
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  points: number;
  icon: string;
  unlocked: boolean;
}

interface TimePickerValue {
  hours: number;
  minutes: number;
  seconds: number;
}

interface QuickTimeOption {
  label: string;
  minutes: number;
  icon: string;
}

const quickTimeOptions: QuickTimeOption[] = [
  { label: '15 دقيقة', minutes: 15, icon: '⚡' },
  { label: '30 دقيقة', minutes: 30, icon: '🕐' },
  { label: 'ساعة', minutes: 60, icon: '⏰' },
  { label: 'ساعتين', minutes: 120, icon: '🕑' },
  { label: '4 ساعات', minutes: 240, icon: '📅' },
  { label: 'يوم كامل', minutes: 1440, icon: '📆' },
];

const { width, height } = Dimensions.get('window');

function App(): React.JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [achievements, setAchievements] = useState<Achievement[]>([
    {
      id: 'first_task',
      title: 'البداية المثالية',
      description: 'أكمل مهمتك الأولى',
      points: 10,
      icon: '🌟',
      unlocked: false
    },
    {
      id: 'five_tasks',
      title: 'منجز نشيط',
      description: 'أكمل 5 مهام',
      points: 50,
      icon: '🏆',
      unlocked: false
    },
    {
      id: 'streak_3',
      title: 'متألق',
      description: 'أكمل 3 مهام في يوم واحد',
      points: 30,
      icon: '⚡️',
      unlocked: false
    },
    {
      id: 'priority_master',
      title: 'سيد الأولويات',
      description: 'أكمل 3 مهام عالية الأولوية',
      points: 40,
      icon: '👑',
      unlocked: false
    }
  ]);
  
  const [showAchievement, setShowAchievement] = useState<Achievement | null>(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [selectedTime, setSelectedTime] = useState<TimePickerValue>({
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  const [selectedPriority, setSelectedPriority] = useState<Task['priority']>('medium');
  const [selectedReminder, setSelectedReminder] = useState<number>(0); // 0 يعني لا يوجد تذكير
  const [selectedRepeat, setSelectedRepeat] = useState<Task['repeats']>(null);
  const [showReminderSelector, setShowReminderSelector] = useState(false);
  const [showRepeatSelector, setShowRepeatSelector] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showCompletedTasks, setShowCompletedTasks] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // تهيئة الإشعارات عند بدء التطبيق
        await NotificationService.requestPermission().catch(error => 
          console.error('خطأ في تهيئة الإشعارات:', error)
        );
        
        // تحميل البيانات
        const savedPoints = await AsyncStorage.getItem('userPoints');
        if (savedPoints) {
          setUserPoints(parseInt(savedPoints, 10));
        }

        const savedTasks = await AsyncStorage.getItem('tasks');
        if (savedTasks) {
          const parsedTasks = JSON.parse(savedTasks);
          const tasksWithDates = parsedTasks.map((task: any) => ({
            ...task,
            deadline: new Date(task.deadline),
            createdAt: new Date(task.createdAt)
          }));
          setTasks(tasksWithDates);
          
          // جدولة الإشعارات للمهام غير المكتملة
          tasksWithDates.forEach(task => {
            if (!task.completed && !task.expired && new Date(task.deadline) > new Date()) {
              NotificationService.scheduleTaskNotification(
                task.id,
                task.title,
                task.deadline,
                'حان موعد المهمة!'
              );
              
              if (task.reminder > 0) {
                const reminderTime = new Date(task.deadline.getTime() - task.reminder * 60000);
                if (reminderTime > new Date()) {
                  NotificationService.scheduleTaskNotification(
                    task.id + 1000000,
                    `تذكير: ${task.title}`,
                    reminderTime,
                    `باقي ${task.reminder} دقيقة على موعد المهمة`
                  );
                }
              }
            }
          });
        }
      } catch (error) {
        console.error('خطأ في تهيئة التطبيق:', error);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    const keyboardWillShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    };

    const keyboardWillHide = () => {
      setKeyboardHeight(0);
    };

    const showSubscription = Keyboard.addListener('keyboardWillShow', keyboardWillShow);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', keyboardWillHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const saveTasksToStorage = async (updatedTasks: Task[]) => {
    try {
      await AsyncStorage.setItem('tasks', JSON.stringify(updatedTasks));
    } catch (error) {
      console.error('خطأ في حفظ المهام:', error);
    }
  };

  const loadTasks = async () => {
    try {
      const tasksData = await AsyncStorage.getItem('tasks');
      if (tasksData) {
        const parsedTasks = JSON.parse(tasksData);
        const loadedTasks = parsedTasks.map((task: any) => ({
          ...task,
          deadline: new Date(task.deadline),
          createdAt: new Date(task.createdAt)
        }));
        setTasks(loadedTasks);
      }
    } catch (error) {
      console.error('خطأ في استرجاع المهام:', error);
    }
  };

  const loadPoints = async () => {
    try {
      const savedPoints = await AsyncStorage.getItem('userPoints');
      if (savedPoints) {
        setUserPoints(parseInt(savedPoints, 10));
      }
    } catch (error) {
      console.error('خطأ في استرجاع النقاط:', error);
    }
  };

  const updatePoints = (newPoints: number) => {
    setUserPoints(newPoints);
    savePoints(newPoints);
  };

  const savePoints = async (points: number) => {
    try {
      await AsyncStorage.setItem('userPoints', points.toString());
    } catch (error) {
      console.error('خطأ في حفظ النقاط:', error);
    }
  };

  const scheduleNotification = async (task: Task) => {
    try {
      // إشعار الموعد النهائي
      if (!task.completed && !task.expired && new Date(task.deadline) > new Date()) {
        await NotificationService.scheduleTaskNotification(
          task.id,
          task.title,
          task.deadline,
          'حان موعد المهمة!'
        );
      }

      // إشعار التذكير
      if (task.reminder > 0) {
        const reminderTime = new Date(task.deadline.getTime() - task.reminder * 60000);
        if (reminderTime > new Date()) {
          await NotificationService.scheduleTaskNotification(
            task.id + 1000000,
            `تذكير: ${task.title}`,
            reminderTime,
            `باقي ${task.reminder} دقيقة على موعد المهمة`
          );
        }
      }
    } catch (error) {
      console.error('خطأ في جدولة الإشعارات:', error);
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) {
      alert('يرجى إدخال عنوان المهمة');
      return;
    }

    const totalSeconds = 
      selectedTime.hours * 3600 + 
      selectedTime.minutes * 60 + 
      selectedTime.seconds;

    if (totalSeconds === 0) {
      alert('يرجى تحديد وقت للمهمة');
      return;
    }

    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + totalSeconds);
    
    const newTaskItem: Task = {
      id: Date.now(),
      title: newTask,
      description: taskDescription,
      completed: false,
      deadline,
      createdAt: new Date(),
      priority: selectedPriority,
      isStarred: false,
      reminder: selectedReminder,
      repeats: selectedRepeat,
      expired: false
    };

    try {
      // إضافة المهمة وحفظها
      const updatedTasks = [newTaskItem, ...tasks];
      setTasks(updatedTasks);
      await saveTasksToStorage(updatedTasks);

      // جدولة الإشعارات
      await scheduleNotification(newTaskItem);

      // تنظيف النموذج
      setNewTask('');
      setTaskDescription('');
      setSelectedTime({ hours: 0, minutes: 0, seconds: 0 });
      setSelectedPriority('medium');
      setSelectedReminder(0);
      setSelectedRepeat(null);
      setShowReminderSelector(false);
      setShowRepeatSelector(false);
      setModalVisible(false);

      if (selectedRepeat) {
        scheduleNextRepetition(newTaskItem);
      }
    } catch (error) {
      console.error('خطأ في إضافة المهمة:', error);
      alert('حدث خطأ في إضافة المهمة. يرجى المحاولة مرة أخرى.');
    }
  };

  const scheduleNextRepetition = (task: Task) => {
    const nextDeadline = new Date(task.deadline);
    
    switch (task.repeats) {
      case 'daily':
        nextDeadline.setDate(nextDeadline.getDate() + 1);
        break;
      case 'weekly':
        nextDeadline.setDate(nextDeadline.getDate() + 7);
        break;
      case 'monthly':
        nextDeadline.setMonth(nextDeadline.getMonth() + 1);
        break;
    }

    const nextTask: Task = {
      ...task,
      id: Date.now(),
      deadline: nextDeadline,
      createdAt: new Date(),
      completed: false,
      expired: false
    };

    const updatedTasks = [...tasks, nextTask];
    setTasks(updatedTasks);
    saveTasksToStorage(updatedTasks);
    
    NotificationService.scheduleTaskNotification(
      nextTask.id,
      nextTask.title,
      nextTask.deadline
    );

    if (nextTask.reminder > 0) {
      const reminderTime = new Date(nextDeadline.getTime() - nextTask.reminder * 60000);
      NotificationService.scheduleTaskNotification(
        nextTask.id + 1000000,
        `تذكير: ${nextTask.title}`,
        reminderTime,
        'سيبدأ موعد المهمة قريباً'
      );
    }
  };

  const deleteTask = async (id: number) => {
    const updatedTasks = tasks.filter(task => task.id !== id);
    setTasks(updatedTasks);
    saveTasksToStorage(updatedTasks);
    NotificationService.cancelTaskNotification(id);
  };

  const toggleTask = async (id: number) => {
    const now = new Date();
    const updatedTasks = tasks.map(task => {
      if (task.id === id) {
        // التحقق من انتهاء وقت المهمة
        const isExpired = !task.completed && new Date(task.deadline) < now;
        const updatedTask = { 
          ...task, 
          completed: !task.completed,
          expired: isExpired || task.expired // الاحتفاظ بحالة انتهاء الوقت
        };
        
        // إضافة النقاط فقط إذا تم إكمال المهمة ولم ينته وقتها
        if (updatedTask.completed && !updatedTask.expired) {
          checkAchievements(updatedTask);
        }
        
        if (updatedTask.completed) {
          NotificationService.cancelTaskNotification(id);
        }
        
        return updatedTask;
      }
      return task;
    });

    setTasks(updatedTasks);
    saveTasksToStorage(updatedTasks);
  };

  const toggleStar = (id: number) => {
    const updatedTasks = tasks.map(task => 
      task.id === id ? { ...task, isStarred: !task.isStarred } : task
    );
    setTasks(updatedTasks);
    saveTasksToStorage(updatedTasks);
  };

  const updatePointsWithNotification = (points: number, achievement: Achievement) => {
    // تحديث النقاط والتنبيه في نفس الوقت
    Promise.all([
      setUserPoints(points),
      setShowAchievement(achievement),
      savePoints(points)
    ]);
  };

  const checkAchievements = (completedTask: Task) => {
    // لا نضيف نقاط إذا انتهى وقت المهمة
    if (completedTask.expired) {
      return;
    }

    
    let newPoints = 0;
    const updatedAchievements = [...achievements];
    const completedTasks = tasks.filter(t => t.completed).length;

    // نقاط للمهمة المكتملة
    switch (completedTask.priority) {
      case 'high':
        newPoints += 5;
        break;
      case 'medium':
        newPoints += 3;
        break;
      case 'low':
        newPoints += 2;
        break;
    }

    let achievementToShow = null;

    // التحقق من الإنجازات
    if (completedTasks === 1) {
      const achievement = updatedAchievements.find(a => a.id === 'first_task');
      if (achievement && !achievement.unlocked) {
        achievement.unlocked = true;
        newPoints += 5;
        achievementToShow = achievement;
      }
    }

    if (completedTasks === 5) {
      const achievement = updatedAchievements.find(a => a.id === 'five_tasks');
      if (achievement && !achievement.unlocked) {
        achievement.unlocked = true;
        newPoints += 10;
        achievementToShow = achievement;
      }
    }

    const todayTasks = tasks.filter(t => 
      t.completed && 
      new Date(t.createdAt).toDateString() === new Date().toDateString()
    ).length;

    if (todayTasks === 3) {
      const achievement = updatedAchievements.find(a => a.id === 'streak_3');
      if (achievement && !achievement.unlocked) {
        achievement.unlocked = true;
        newPoints += 8;
        achievementToShow = achievement;
      }
    }

    const highPriorityCompleted = tasks.filter(t => 
      t.completed && t.priority === 'high'
    ).length;

    if (highPriorityCompleted === 3) {
      const achievement = updatedAchievements.find(a => a.id === 'priority_master');
      if (achievement && !achievement.unlocked) {
        achievement.unlocked = true;
        newPoints += 10;
        achievementToShow = achievement;
      }
    }

    const finalPoints = userPoints + newPoints;

    // إظهار تنبيه إكمال المهمة إذا لم يكن هناك إنجاز
    if (!achievementToShow && newPoints > 0) {
      achievementToShow = {
        id: 'task_completed',
        title: 'أحسنت!',
        description: 'تم إكمال المهمة بنجاح',
        points: newPoints,
        icon: '✅',
        unlocked: true
      };
    }

    if (achievementToShow) {
      updatePointsWithNotification(finalPoints, achievementToShow);
    } else {
      setUserPoints(finalPoints);
      savePoints(finalPoints);
    }
  };

  const deductPointsForExpiredTask = (task: Task) => {
    let pointsToDeduct = 0;
    switch (task.priority) {
      case 'high':
        pointsToDeduct = 8;
        break;
      case 'medium':
        pointsToDeduct = 5;
        break;
      case 'low':
        pointsToDeduct = 3;
        break;
    }
    
    const newPoints = Math.max(0, userPoints - pointsToDeduct);
    
    // إظهار تنبيه خصم النقاط فوراً
    const notification = {
      id: 'points_deducted',
      title: 'تنبيه!',
      description: `تم خصم ${pointsToDeduct} نقطة لانتهاء وقت المهمة: ${task.title}`,
      points: -pointsToDeduct,
      icon: '⚠️',
      unlocked: true
    };

    updatePointsWithNotification(newPoints, notification);
  };

  const checkExpiredTasks = useCallback(() => {
    const now = new Date();
    let expiredTasksFound = false;
    
    const updatedTasks = tasks.map(task => {
      if (!task.completed && !task.expired && new Date(task.deadline) < now) {
        expiredTasksFound = true;
        
        // حساب النقاط المخصومة فوراً
        let pointsToDeduct = 0;
        switch (task.priority) {
          case 'high':
            pointsToDeduct = 8;
            break;
          case 'medium':
            pointsToDeduct = 5;
            break;
          case 'low':
            pointsToDeduct = 3;
            break;
        }
        
        const newPoints = Math.max(0, userPoints - pointsToDeduct);
        
        // إظهار التنبيه فوراً
        updatePointsWithNotification(newPoints, {
          id: 'points_deducted',
          title: 'تنبيه!',
          description: `تم خصم ${pointsToDeduct} نقطة لانتهاء وقت المهمة: ${task.title}`,
          points: -pointsToDeduct,
          icon: '⚠️',
          unlocked: true
        });
        
        return { ...task, expired: true };
      }
      return task;
    });
    
    if (expiredTasksFound) {
      setTasks(updatedTasks);
      saveTasksToStorage(updatedTasks)
        .catch(error => console.error('خطأ في حفظ المهام:', error));
    }
  }, [tasks, userPoints]);

  // تحديث التحقق من المهام منتهية الوقت كل ثانية
  useEffect(() => {
    const checkInterval = setInterval(checkExpiredTasks, 1000);
    return () => clearInterval(checkInterval);
  }, [checkExpiredTasks]);

  // تحديث الوقت الحالي كل ثانية
  useEffect(() => {
    const timeInterval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // التحقق من المهام المنتهية فوراً عند تحديث الوقت
      tasks.forEach(task => {
        if (!task.completed && !task.expired && new Date(task.deadline) < now) {
          const updatedTasks = tasks.map(t => 
            t.id === task.id ? { ...t, expired: true } : t
          );
          setTasks(updatedTasks);
          saveTasksToStorage(updatedTasks);
          deductPointsForExpiredTask(task);
        }
      });
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, [tasks]);

  const PrioritySelector = () => (
    <View style={styles.priorityContainer}>
      <View style={styles.priorityButtons}>
        {(['low', 'medium', 'high'] as const).map((priority) => (
          <TouchableOpacity
            key={priority}
            style={[
              styles.priorityButton,
              selectedPriority === priority && styles.selectedPriority,
              { backgroundColor: getPriorityColor(priority) }
            ]}
            onPress={() => setSelectedPriority(priority)}
          >
            <Text style={styles.priorityButtonText}>
              {getPriorityLabel(priority)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return '#e94560';
      case 'medium': return '#f4a261';
      case 'low': return '#2a9d8f';
    }
  };

  const getPriorityLabel = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'عالية';
      case 'medium': return 'متوسطة';
      case 'low': return 'منخفضة';
    }
  };

  const formatTimeLeft = (deadline: Date) => {
    const seconds = differenceInSeconds(deadline, currentTime);
    if (seconds <= 0) return 'انتهى الوقت';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    let timeString = '';
    if (hours > 0) timeString += `${hours} ساعة `;
    if (minutes > 0) timeString += `${minutes} دقيقة `;
    if (remainingSeconds > 0) timeString += `${remainingSeconds} ثانية`;
    
    return timeString.trim();
  };

  const TimePickerComponent = ({ value, onChange }: { 
    value: TimePickerValue, 
    onChange: (value: TimePickerValue) => void 
  }) => {
    const formatNumber = (num: number) => num.toString().padStart(2, '0');

    const adjustTime = (type: 'hours' | 'minutes' | 'seconds', increment: boolean) => {
      const maxValue = type === 'hours' ? 23 : 59;
      const currentValue = value[type];
      let newValue = increment ? currentValue + 1 : currentValue - 1;
      
      if (newValue > maxValue) newValue = 0;
      if (newValue < 0) newValue = maxValue;
      
      onChange({ ...value, [type]: newValue });
    };

    return (
      <View style={styles.timePickerContainer}>
        <Text style={styles.timePickerTitle}>تحديد الوقت</Text>

        <View style={styles.timeUnitsContainer}>
          {/* ساعات */}
          <View style={styles.timeUnit}>
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => adjustTime('hours', true)}
            >
              <Text style={styles.timeButtonText}>+</Text>
            </TouchableOpacity>
            
            <View style={styles.timeValue}>
              <Text style={styles.timeValueText}>{formatNumber(value.hours)}</Text>
              <Text style={styles.timeUnitLabel}>ساعة</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => adjustTime('hours', false)}
            >
              <Text style={styles.timeButtonText}>-</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.timeSeparator}>:</Text>

          {/* دقائق */}
          <View style={styles.timeUnit}>
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => adjustTime('minutes', true)}
            >
              <Text style={styles.timeButtonText}>+</Text>
            </TouchableOpacity>
            
            <View style={styles.timeValue}>
              <Text style={styles.timeValueText}>{formatNumber(value.minutes)}</Text>
              <Text style={styles.timeUnitLabel}>دقيقة</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => adjustTime('minutes', false)}
            >
              <Text style={styles.timeButtonText}>-</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.timeSeparator}>:</Text>

          {/* ثواني */}
          <View style={styles.timeUnit}>
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => adjustTime('seconds', true)}
            >
              <Text style={styles.timeButtonText}>+</Text>
            </TouchableOpacity>
            
            <View style={styles.timeValue}>
              <Text style={styles.timeValueText}>{formatNumber(value.seconds)}</Text>
              <Text style={styles.timeUnitLabel}>ثانية</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.timeButton}
              onPress={() => adjustTime('seconds', false)}
            >
              <Text style={styles.timeButtonText}>-</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>
    );
  };

  const TaskStats = () => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.completed).length;
    const starredTasks = tasks.filter(task => task.isStarred).length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return (
      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>📊 إحصائيات المهام</Text>
        <View style={styles.statsContent}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalTasks}</Text>
            <Text style={styles.statLabel}>إجمالي المهام</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{completedTasks}</Text>
            <Text style={styles.statLabel}>المهام المكتملة</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{completionRate.toFixed(0)}%</Text>
            <Text style={styles.statLabel}>نسبة الإنجاز</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{starredTasks}</Text>
            <Text style={styles.statLabel}>المهام المميزة</Text>
          </View>
        </View>
      </View>
    );
  };

  const ReminderSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>⏰ التذكير قبل الموعد</Text>
      <View style={styles.selectorButtons}>
        {[5, 15, 30, 60].map((minutes) => (
          <TouchableOpacity
            key={minutes}
            style={[
              styles.selectorButton,
              selectedReminder === minutes && styles.selectedButton
            ]}
            onPress={() => setSelectedReminder(minutes)}
          >
            <Text style={styles.selectorButtonText}>
              {minutes} دقيقة
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const RepeatSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>🔄 تكرار المهمة</Text>
      <View style={styles.selectorButtons}>
        {[
          { value: null, label: 'بدون تكرار' },
          { value: 'daily', label: 'يومياً' },
          { value: 'weekly', label: 'أسبوعياً' },
          { value: 'monthly', label: 'شهرياً' }
        ].map((option) => (
          <TouchableOpacity
            key={option.value || 'none'}
            style={[
              styles.selectorButton,
              selectedRepeat === option.value && styles.selectedButton
            ]}
            onPress={() => setSelectedRepeat(option.value)}
          >
            <Text style={styles.selectorButtonText}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#1a1a2e',
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 100,
    },
    headerContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    pointsContainer: {
      backgroundColor: '#e94560',
      borderRadius: 15,
      padding: 10,
      alignItems: 'center',
    },
    pointsText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    pointsLabel: {
      color: '#ffffff',
      fontSize: 12,
    },
    header: {
      fontSize: 28,
      fontWeight: 'bold',
      textAlign: 'center',
      marginVertical: 20,
      color: '#e94560',
      textShadowColor: 'rgba(233, 69, 96, 0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 10,
    },
    taskList: {
      flex: 1,
    },
    taskItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#16213e',
      padding: 15,
      borderRadius: 10,
      marginBottom: 10,
      borderLeftWidth: 4,
      borderLeftColor: '#e94560',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    taskContent: {
      flex: 1,
      marginLeft: 10,
    },
    taskTitle: {
      fontSize: 16,
      color: '#ffffff',
      marginBottom: 5,
    },
    taskDescription: {
      fontSize: 14,
      color: '#808080',
      marginBottom: 5,
    },
    taskTime: {
      fontSize: 14,
      color: '#808080',
    },
    deleteButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: '#2a0a12',
    },
    deleteButtonText: {
      color: '#e94560',
      fontSize: 20,
      fontWeight: 'bold',
    },
    completedTask: {
      borderLeftColor: '#16ab39',
    },
    completedTaskTitle: {
      textDecorationLine: 'line-through',
      color: '#808080',
    },
    switch: {
      transform: [{ scale: 1.1 }],
    },
    priorityContainer: {
      marginBottom: 15,
    },
    priorityLabel: {
      color: '#ffffff',
      marginBottom: 10,
      fontSize: 16,
    },
    priorityButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    priorityButton: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      marginHorizontal: 5,
      alignItems: 'center',
      opacity: 0.6,
    },
    selectedPriority: {
      opacity: 1,
    },
    priorityButtonText: {
      color: '#ffffff',
      fontWeight: 'bold',
    },
    priorityIndicator: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      borderTopLeftRadius: 10,
      borderBottomLeftRadius: 10,
    },
    taskMetadata: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 5,
    },
    taskPriority: {
      fontSize: 12,
      fontWeight: 'bold',
    },
    taskRepeat: {
      color: '#e94560',
      fontSize: 12,
      marginLeft: 10,
    },
    addButton: {
      position: 'absolute',
      right: 30,
      bottom: 30,
      backgroundColor: '#2196F3',
      width: 60,
      height: 60,
      borderRadius: 30,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 8,
      zIndex: 999,
    },
    addButtonText: {
      color: '#fff',
      fontSize: 30,
      fontWeight: 'bold',
    },
    modalStyle: {
      margin: 0,
      justifyContent: 'flex-start',
      marginTop: 40,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalScrollView: {
      backgroundColor: '#16213e',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
    },
    modalContent: {
      padding: 20,
    },
    modalTitle: {
      color: '#e94560',
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 20,
      textShadowColor: 'rgba(233, 69, 96, 0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },
    input: {
      backgroundColor: '#0f3460',
      borderRadius: 10,
      padding: 15,
      color: '#ffffff',
      marginBottom: 15,
      fontSize: 16,
      borderWidth: 1,
      borderColor: '#e94560',
    },
    description: {
      backgroundColor: '#0f3460',
      borderRadius: 10,
      padding: 15,
      color: '#ffffff',
      marginBottom: 15,
      fontSize: 16,
      minHeight: 100,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: '#e94560',
    },
    timePickerContainer: {
      backgroundColor: '#0f3460',
      borderRadius: 15,
      padding: 20,
      marginBottom: 15,
    },
    timePickerTitle: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 20,
    },
    timeUnitsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#16213e',
      borderRadius: 12,
      padding: 15,
      marginBottom: 15,
    },
    timeUnit: {
      alignItems: 'center',
      width: 80,
    },
    timeButton: {
      backgroundColor: '#1a1a2e',
      borderRadius: 8,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#e94560',
    },
    timeButtonPressed: {
      backgroundColor: '#e94560',
      transform: [{ scale: 0.95 }],
    },
    timeButtonText: {
      color: '#e94560',
      fontSize: 24,
      fontWeight: 'bold',
    },
    timeValue: {
      paddingVertical: 10,
      alignItems: 'center',
    },
    timeValueText: {
      color: '#ffffff',
      fontSize: 24,
      fontWeight: 'bold',
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    timeUnitLabel: {
      color: '#808080',
      fontSize: 12,
      marginTop: 5,
    },
    timeSeparator: {
      color: '#e94560',
      fontSize: 24,
      marginHorizontal: 10,
      fontWeight: 'bold',
    },
    totalTimeDisplay: {
      backgroundColor: '#16213e',
      borderRadius: 8,
      padding: 15,
      alignItems: 'center',
    },
    totalTimeValue: {
      color: '#e94560',
      fontSize: 16,
      fontWeight: 'bold',
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 20,
    },
    button: {
      flex: 1,
      padding: 15,
      borderRadius: 10,
      marginHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    addButton: {
      backgroundColor: '#e94560',
      elevation: 5,
      shadowColor: '#e94560',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      height: 50,
    },
    cancelButton: {
      backgroundColor: '#0f3460',
      height: 50,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginTop: 25,
      marginBottom: 15,
      color: '#e94560',
      textShadowColor: 'rgba(233, 69, 96, 0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 5,
    },
    fab: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: '#e94560',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#e94560',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 5,
    },
    fabText: {
      fontSize: 30,
      color: '#ffffff',
      fontWeight: 'bold',
    },
    filterContainer: {
      marginBottom: 15,
    },
    filterButton: {
      backgroundColor: '#0f3460',
      padding: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    activeFilter: {
      backgroundColor: '#e94560',
    },
    filterButtonText: {
      color: '#ffffff',
      fontWeight: 'bold',
    },
    starButton: {
      padding: 5,
    },
    starButtonText: {
      fontSize: 20,
    },
    statsContainer: {
      backgroundColor: '#16213e',
      borderRadius: 15,
      padding: 15,
      marginBottom: 20,
    },
    statsTitle: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 10,
    },
    statsContent: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      color: '#e94560',
      fontSize: 24,
      fontWeight: 'bold',
    },
    statLabel: {
      color: '#ffffff',
      fontSize: 12,
      marginTop: 5,
    },
    selectorContainer: {
      marginBottom: 15,
    },
    selectorTitle: {
      color: '#ffffff',
      fontSize: 16,
      marginBottom: 10,
    },
    selectorButtons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    selectorButton: {
      flex: 1,
      padding: 10,
      borderRadius: 8,
      marginHorizontal: 5,
      alignItems: 'center',
      opacity: 0.6,
    },
    selectedButton: {
      opacity: 1,
    },
    selectorButtonText: {
      color: '#ffffff',
      fontWeight: 'bold',
    },
    achievementPopup: {
      backgroundColor: '#16213e',
      borderRadius: 15,
      padding: 15,
      marginBottom: 20,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#e94560',
      shadowColor: '#e94560',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    achievementIcon: {
      fontSize: 30,
      marginRight: 15,
    },
    achievementContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      position: 'relative',
    },
    achievementTextContent: {
      flex: 1,
    },
    achievementTitle: {
      color: '#e94560',
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 5,
    },
    achievementDescription: {
      color: '#ffffff',
      fontSize: 14,
      marginBottom: 5,
    },
    achievementPoints: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    closeButton: {
      position: 'absolute',
      top: -5,
      right: -5,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#e94560',
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 3,
    },
    closeButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: 'bold',
    },
    optionButton: {
      backgroundColor: '#0f3460',
      padding: 10,
      borderRadius: 8,
      marginBottom: 15,
    },
    optionButtonText: {
      color: '#ffffff',
      textAlign: 'center',
      fontWeight: 'bold',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <View style={styles.headerContainer}>
            <Text style={styles.header}>✨ مهامي ✨</Text>
            <View style={styles.pointsContainer}>
              <Text style={styles.pointsText}>🏆 {userPoints}</Text>
              <Text style={styles.pointsLabel}>نقطة</Text>
            </View>
          </View>

          {showAchievement && (
            <View style={styles.achievementPopup}>
              <View style={styles.achievementContent}>
                <Text style={styles.achievementIcon}>{showAchievement.icon}</Text>
                <View style={styles.achievementTextContent}>
                  <Text style={styles.achievementTitle}>{showAchievement.title}</Text>
                  <Text style={styles.achievementDescription}>{showAchievement.description}</Text>
                  <Text style={[
                    styles.achievementPoints,
                    { color: showAchievement.points > 0 ? '#4CAF50' : '#e94560' }
                  ]}>
                    {showAchievement.points > 0 ? '+' : ''}{showAchievement.points} نقطة
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setShowAchievement(null)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TaskStats />

          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[styles.filterButton, showCompletedTasks && styles.activeFilter]}
              onPress={() => setShowCompletedTasks(!showCompletedTasks)}
            >
              <Text style={styles.filterButtonText}>
                {showCompletedTasks ? '🔽 إخفاء المهام المكتملة' : '🔼 إظهار المهام المكتملة'}
              </Text>
            </TouchableOpacity>
          </View>

          {tasks.filter(task => !task.completed).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>📝 المهام النشطة</Text>
              {tasks
                .filter(task => !task.completed)
                .sort((a, b) => (b.isStarred ? 1 : -1) - (a.isStarred ? 1 : -1))
                .map(task => (
                  <View key={task.id} style={styles.taskItem}>
                    <Switch
                      value={task.completed}
                      onValueChange={() => toggleTask(task.id)}
                      trackColor={{ false: '#0f3460', true: '#e9456033' }}
                      thumbColor={task.completed ? '#e94560' : '#f4f3f4'}
                      style={styles.switch}
                    />
                    <View style={styles.taskContent}>
                      <View style={styles.taskHeader}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <TouchableOpacity
                          onPress={() => toggleStar(task.id)}
                          style={styles.starButton}
                        >
                          <Text style={styles.starButtonText}>
                            {task.isStarred ? '⭐️' : '☆'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {task.description && (
                        <Text style={styles.taskDescription}>{task.description}</Text>
                      )}
                      <View style={styles.taskMetadata}>
                        <Text style={[styles.taskPriority, { color: getPriorityColor(task.priority) }]}>
                          {getPriorityLabel(task.priority)}
                        </Text>
                        <Text style={styles.taskTime}>
                          ⏳ {formatTimeLeft(task.deadline)}
                        </Text>
                        {task.repeats && (
                          <Text style={styles.taskRepeat}>
                            🔄 {task.repeats === 'daily' ? 'يومياً' : task.repeats === 'weekly' ? 'أسبوعياً' : 'شهرياً'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteTask(task.id)}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </>
          )}

          {showCompletedTasks && tasks.filter(task => task.completed).length > 0 && (
            <>
              <Text style={styles.sectionTitle}>✅ المهام المنجزة</Text>
              {tasks
                .filter(task => task.completed)
                .map(task => (
                  <View key={task.id} style={[styles.taskItem, styles.completedTask]}>
                    <Switch
                      value={task.completed}
                      onValueChange={() => toggleTask(task.id)}
                      trackColor={{ false: '#0f3460', true: '#16ab3933' }}
                      thumbColor={task.completed ? '#16ab39' : '#f4f3f4'}
                      style={styles.switch}
                    />
                    <View style={styles.taskContent}>
                      <Text style={[styles.taskTitle, styles.completedTaskTitle]}>
                        {task.title}
                      </Text>
                      {task.description && (
                        <Text style={styles.taskDescription}>{task.description}</Text>
                      )}
                      <View style={styles.taskMetadata}>
                        <Text style={[styles.taskPriority, { color: getPriorityColor(task.priority) }]}>
                          {getPriorityLabel(task.priority)}
                        </Text>
                        <Text style={styles.taskTime}>
                          🎉 تم الإنجاز: {format(task.deadline, 'PPpp', { locale: ar })}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteTask(task.id)}
                    >
                      <Text style={styles.deleteButtonText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
            </>
          )}

          {tasks.length === 0 && (
            <Text style={[styles.taskDescription, { textAlign: 'center', marginTop: 50 }]}>
              لا توجد مهام حالياً. أضف مهمة جديدة! ✨
            </Text>
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <ScrollView style={styles.modalScrollView}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>✨ مهمة جديدة</Text>
              
              <TextInput
                style={styles.input}
                placeholder="عنوان المهمة"
                placeholderTextColor="#999"
                value={newTask}
                onChangeText={setNewTask}
              />
              
              <TextInput
                style={styles.description}
                placeholder="وصف المهمة (اختياري)"
                placeholderTextColor="#999"
                value={taskDescription}
                onChangeText={setTaskDescription}
                multiline
              />

              <PrioritySelector />
              
              <TouchableOpacity 
                style={styles.optionButton}
                onPress={() => setShowReminderSelector(!showReminderSelector)}
              >
                <Text style={styles.optionButtonText}>
                  {showReminderSelector ? '🔽 إخفاء التذكير' : '🔼 إضافة تذكير'}
                </Text>
              </TouchableOpacity>

              {showReminderSelector && <ReminderSelector />}
              
              <TouchableOpacity 
                style={styles.optionButton}
                onPress={() => setShowRepeatSelector(!showRepeatSelector)}
              >
                <Text style={styles.optionButtonText}>
                  {showRepeatSelector ? '🔽 إخفاء التكرار' : '🔼 إضافة تكرار'}
                </Text>
              </TouchableOpacity>

              {showRepeatSelector && <RepeatSelector />}
              
              <TimePickerComponent
                value={selectedTime}
                onChange={setSelectedTime}
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.buttonText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.addButton]}
                  onPress={addTask}
                >
                  <Text style={styles.buttonText}>إضافة</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default App;
