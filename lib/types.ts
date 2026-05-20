export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description?: string;
  posted_at?: string;
  [key: string]: any;
}
