import { TaskModel } from '../models/types';
import { buildBaseUrl, getTenantHeaders } from '../config/api';

export interface TaskNoteResponse {
  id: number;
  uuid: string;
  task_id: number;
  note: string;
  user_id: number;
  created_at: string;
  updated_at: string;
}

interface ApiClientConfig {
  baseUrl: string;
  authToken?: string;
  subdomain?: string;
}

export class ApiClient {
  private baseUrl: string;
  private authToken?: string;
  private subdomain?: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.authToken = config.authToken;
    this.subdomain = config.subdomain;
  }

  /** Reconfigure the client with a new subdomain + token. */
  configure(subdomain: string, token: string): void {
    this.subdomain = subdomain;
    this.authToken = token;
    this.baseUrl = buildBaseUrl(subdomain);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getTenantHeaders(this.subdomain),
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async getTasks(page: number = 1, perPage: number = 20): Promise<TaskModel[]> {
    const url = `${this.baseUrl}/api/tasks?page=${page}&per_page=${perPage}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.status}`);
    }

    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data)) {
      return data as TaskModel[];
    }
    
    if (data.data && Array.isArray(data.data)) {
      return data.data as TaskModel[];
    }

    return [];
  }

  async getTask(id: number): Promise<TaskModel | null> {
    const url = `${this.baseUrl}/api/tasks/${id}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task: ${response.status}`);
    }

    const data = await response.json();
    return data as TaskModel;
  }

  async createTask(task: Partial<TaskModel>): Promise<TaskModel> {
    const url = `${this.baseUrl}/api/tasks`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(task),
    });

    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.status}`);
    }

    const data = await response.json();
    return data as TaskModel;
  }

  async updateTask(id: number, task: Partial<TaskModel>): Promise<TaskModel> {
    const url = `${this.baseUrl}/api/tasks/${id}`;
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(task),
    });

    if (!response.ok) {
      throw new Error(`Failed to update task: ${response.status}`);
    }

    const data = await response.json();
    return data as TaskModel;
  }

  async deleteTask(id: number): Promise<void> {
    const url = `${this.baseUrl}/api/tasks/${id}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete task: ${response.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // FCM token endpoints (POST/DELETE /api/fcm-tokens)
  // These are landlord-level routes (no tenant required).
  // ---------------------------------------------------------------------------

  /**
   * Register an FCM device token with the backend.
   * Backend route: POST /api/fcm-tokens
   */
  async registerFcmToken(params: {
    fcm_token: string;
    platform: 'android' | 'ios' | 'web';
    device_id?: string;
    app_version?: string;
  }): Promise<void> {
    // FCM token routes live at the landlord level (no tenant prefix)
    const url = `${this.baseUrl}/fcm-tokens`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.warn(`[API] FCM token registration failed: ${response.status}`);
    }
  }

  /**
   * Remove an FCM device token from the backend (e.g., on logout).
   * Backend route: DELETE /api/fcm-tokens
   */
  async removeFcmToken(fcmToken: string): Promise<void> {
    const url = `${this.baseUrl}/fcm-tokens`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({ fcm_token: fcmToken }),
    });

    if (!response.ok) {
      console.warn(`[API] FCM token removal failed: ${response.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Notification endpoints (tenant-level: /api/notifications)
  // ---------------------------------------------------------------------------

  /**
   * Fetch notifications from the backend.
   * Backend route: GET /api/notifications
   */
  async getNotifications(params?: {
    page?: number;
    per_page?: number;
    unread_only?: boolean;
    type?: string;
  }): Promise<{ notifications: any[]; unread_count: number }> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.per_page) query.set('per_page', String(params.per_page));
    if (params?.unread_only) query.set('unread_only', '1');
    if (params?.type) query.set('type', params.type);

    const url = `${this.baseUrl}/notifications${query.toString() ? `?${query}` : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      console.warn(`[API] Fetch notifications failed: ${response.status}`);
      return { notifications: [], unread_count: 0 };
    }

    const json = await response.json();
    const data = json.data ?? {};
    return {
      notifications: data.notifications ?? [],
      unread_count: data.unread_count ?? 0,
    };
  }

  /**
   * Mark a notification as read on the backend.
   * Backend route: POST /api/notifications/{id}/read
   */
  async markNotificationRead(notificationId: string): Promise<void> {
    const url = `${this.baseUrl}/notifications/${notificationId}/read`;
    await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
    });
  }

  /**
   * Mark all notifications as read on the backend.
   * Backend route: POST /api/notifications/read-all
   */
  async markAllNotificationsRead(): Promise<void> {
    const url = `${this.baseUrl}/notifications/read-all`;
    await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
    });
  }

  /**
   * Send a chat message notification to recipients via the backend.
   * The backend persists the notification and delivers it via FCM.
   * Backend route: POST /api/notifications/send-message
   */
  async sendMessageNotification(params: {
    recipient_user_id?: number;
    recipient_user_ids?: number[];
    workspace_id?: number;
    message: string;
    chat_type: 'dm' | 'group' | 'space';
    chat_id?: string;
  }): Promise<void> {
    const url = `${this.baseUrl}/notifications/send-message`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      console.warn(`[API] Send message notification failed: ${response.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Task notes / comments endpoints (tenant-level: /api/task-notes)
  // ---------------------------------------------------------------------------

  /** Fetch all notes for a given task. */
  async getTaskNotes(taskId: number | string): Promise<TaskNoteResponse[]> {
    const url = `${this.baseUrl}/task-notes?task_id=${taskId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch task notes: ${response.status}`);
    }

    const json = await response.json();
    const items = json.data ?? json;
    return Array.isArray(items) ? items : [];
  }

  /** Create a new note on a task. */
  async createTaskNote(params: {
    uuid: string;
    task_id: number;
    note: string;
    user_id: number;
  }): Promise<TaskNoteResponse> {
    const url = `${this.baseUrl}/task-notes`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create task note: ${response.status} ${body}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  // ---------------------------------------------------------------------------
  // Task form endpoints (tenant-level: /api/task-forms)
  // ---------------------------------------------------------------------------

  /**
   * Submit a new form for a task.
   * Backend route: POST /api/task-forms
   */
  async createTaskForm(params: {
    task_id: number;
    form_version_id: number;
    data: Record<string, unknown>;
  }): Promise<{ id: number; task_id: number; form_version_id: number; data: Record<string, unknown> }> {
    const url = `${this.baseUrl}/task-forms`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create task form: ${response.status} ${body}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  /**
   * Update an existing task form submission.
   * Backend route: PATCH /api/task-forms/:id
   */
  async updateTaskForm(
    id: number,
    updates: { data: Record<string, unknown> },
  ): Promise<{ id: number; task_id: number; form_version_id: number; data: Record<string, unknown> }> {
    const url = `${this.baseUrl}/task-forms/${id}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to update task form: ${response.status} ${body}`);
    }

    const json = await response.json();
    return json.data ?? json;
  }

  // ---------------------------------------------------------------------------
  // Task update (PATCH – partial update)
  // ---------------------------------------------------------------------------

  async patchTask(id: number, updates: Record<string, unknown>): Promise<any> {
    const url = `${this.baseUrl}/tasks/${id}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to patch task: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  // ---------------------------------------------------------------------------
  // Chat / Messaging endpoints
  // ---------------------------------------------------------------------------

  /** Create a conversation (DM or group). Backend finds-or-creates for DMs. */
  async createConversation(params: {
    uuid: string;
    type: 'dm' | 'group';
    name?: string | null;
    created_by: number;
    participant_user_ids: number[];
  }): Promise<any> {
    const url = `${this.baseUrl}/conversations`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create conversation: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Mark a conversation as read for the current user. */
  async markConversationRead(conversationId: number): Promise<void> {
    const url = `${this.baseUrl}/conversations/${conversationId}/read`;
    await fetch(url, { method: 'POST', headers: this.getHeaders() });
  }

  /** Send a direct message. */
  async sendDirectMessage(params: {
    uuid: string;
    conversation_id: number;
    user_id: number;
    message: string;
    status?: string;
  }): Promise<any> {
    const url = `${this.baseUrl}/direct-messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to send message: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Edit a direct message. */
  async updateDirectMessage(id: number, updates: { message?: string; status?: string }): Promise<any> {
    const url = `${this.baseUrl}/direct-messages/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to update message: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Delete a direct message. */
  async deleteDirectMessage(id: number): Promise<void> {
    const url = `${this.baseUrl}/direct-messages/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete message: ${response.status}`);
    }
  }

  /** Toggle a reaction on a message. Backend adds if not present, removes if already exists. */
  async toggleMessageReaction(params: { message_id: number; emoji: string }): Promise<any> {
    const url = `${this.baseUrl}/message-reactions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to toggle reaction: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Update a conversation (rename group, etc.) */
  async updateConversation(id: number, updates: { name?: string | null }): Promise<any> {
    const url = `${this.baseUrl}/conversations/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to update conversation: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Add a participant to a conversation. */
  async addConversationParticipant(params: { conversation_id: number; user_id: number }): Promise<any> {
    const url = `${this.baseUrl}/conversation-participants`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to add participant: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Remove a participant from a conversation. */
  async removeConversationParticipant(participantId: number): Promise<void> {
    const url = `${this.baseUrl}/conversation-participants/${participantId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to remove participant: ${response.status}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Workspace Chat (Spaces / Collab) endpoints
  // ---------------------------------------------------------------------------

  /** Send a workspace chat message. */
  async sendWorkspaceChatMessage(params: {
    uuid: string;
    workspace_id: number;
    message: string;
    user_id: number;
  }): Promise<any> {
    const url = `${this.baseUrl}/workspace-chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to send workspace chat message: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Edit a workspace chat message. */
  async updateWorkspaceChatMessage(id: number, updates: { message: string }): Promise<any> {
    const url = `${this.baseUrl}/workspace-chat/${id}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to update workspace chat message: ${response.status} ${body}`);
    }
    const json = await response.json();
    return json.data ?? json;
  }

  /** Delete a workspace chat message. */
  async deleteWorkspaceChatMessage(id: number): Promise<void> {
    const url = `${this.baseUrl}/workspace-chat/${id}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete workspace chat message: ${response.status}`);
    }
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = undefined;
  }
}

// Default API client instance.
// Call apiClient.configure(subdomain, token) after login.
export const apiClient = new ApiClient({
  baseUrl: buildBaseUrl(),
});
