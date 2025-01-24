import notifee, { TimestampTrigger, TriggerType, AndroidImportance } from '@notifee/react-native';
import { Platform } from 'react-native';

class NotificationService {
  static async requestPermission() {
    try {
      await notifee.requestPermission();
      
      if (Platform.OS === 'android') {
        const channel = await notifee.createChannel({
          id: 'tasks',
          name: 'Task Notifications',
          sound: 'default',
          importance: AndroidImportance.HIGH,
        });
        
        // تخزين معرف القناة للاستخدام لاحقاً
        await notifee.setNotificationCategories([{
          id: 'tasks',
          actions: []
        }]);
      }
    } catch (error) {
      console.error('خطأ في إعداد الإشعارات:', error);
    }
  }

  static async scheduleTaskNotification(
    id: number,
    title: string,
    date: Date,
    body: string = 'حان موعد المهمة'
  ) {
    try {
      // إلغاء أي إشعارات سابقة لنفس المهمة
      await this.cancelTaskNotification(id);

      const timestamp = date.getTime();
      
      // تجاهل الإشعارات للأوقات السابقة
      if (timestamp <= Date.now()) {
        return;
      }

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: timestamp,
      };

      const notification = {
        id: id.toString(),
        title: title,
        body: body,
        android: {
          channelId: 'tasks',
          pressAction: {
            id: 'default',
          },
          sound: 'default',
        }
      };

      await notifee.createTriggerNotification(notification, trigger);
      
      // التحقق من حالة الإشعار بعد إنشائه
      const notifications = await notifee.getTriggerNotificationIds();
      if (!notifications.includes(id.toString())) {
        // محاولة إعادة إنشاء الإشعار إذا فشل
        await notifee.createTriggerNotification(notification, trigger);
      }
    } catch (error) {
      console.error('خطأ في جدولة الإشعار:', error);
      
      // محاولة إنشاء إشعار فوري كحل بديل
      try {
        await notifee.displayNotification({
          id: id.toString(),
          title: title,
          body: body,
          android: {
            channelId: 'tasks'
          }
        });
      } catch (fallbackError) {
        console.error('فشل الإشعار البديل:', fallbackError);
      }
    }
  }

  static async cancelTaskNotification(id: number) {
    try {
      await notifee.cancelNotification(id.toString());
      await notifee.cancelTriggerNotification(id.toString());
      
      // إلغاء إشعار التذكير أيضاً
      const reminderId = (id + 1000000).toString();
      await notifee.cancelNotification(reminderId);
      await notifee.cancelTriggerNotification(reminderId);
    } catch (error) {
      console.error('خطأ في إلغاء الإشعار:', error);
    }
  }
}

export default NotificationService;
