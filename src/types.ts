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
}
