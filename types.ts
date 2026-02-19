
export interface Message {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface ToolCallLog {
  id: string;
  name: string;
  args: any;
  status: 'pending' | 'success' | 'error';
  timestamp: Date;
}
