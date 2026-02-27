export interface CallSession {
  id: string;
  leadName: string;
  phone: string;
  address: string;
  startTime: number;
  duration: number;
  status: 'RINGING' | 'HUMAN_DETECTED' | 'AI_SPEAKING' | 'CUSTOMER_SPEAKING' | 'COMPLETED' | 'FAILED' | 'WHISPER' | 'TAKEOVER';
  transcript: string[];
  sentiment: 'Positive' | 'Neutral' | 'Negative' | 'Frustrated';
  convertibleScore: number;
  isLive: boolean;
  persona?: 'Friendly' | 'Busy' | 'Rude' | 'Skeptical' | 'Interested';
  recordingUrl?: string;
  cost?: number;
}

export interface CallDisposition {
  LeadName: string;
  Phone: string;
  Disposition: 'Hot' | 'Warm' | 'Not Interested' | 'DNC' | 'Wrong Number';
  ConvertibleScore: number;
  BookingProbability: string;
  ObjectionType: string;
  Sentiment: string;
  AppointmentBooked: boolean;
  AppointmentDate: string;
  FollowUpRequired: boolean;
  CallDurationSeconds: number;
  Summary: string;
  recordingUrl?: string;
  cost?: number;
}

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

export interface Appointment {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  phone: string;
  time: string;
  price: string;
  recordingUrl?: string;
  description: string;
}
