import { TaskModel } from '../models/types';

interface ApiClientConfig {
  baseUrl: string;
  authToken?: string;
}

export class ApiClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl;
    this.authToken = config.authToken;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
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

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  clearAuthToken(): void {
    this.authToken = undefined;
  }
}

// Default API client instance
export const apiClient = new ApiClient({
  baseUrl: 'https://api.whagons.com', // Replace with actual API URL
});
