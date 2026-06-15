// src/app/jobs/[id].tsx — maps the website path (remotejobs44.com/jobs/:id) onto
// the app's job-detail screen, so shared web links / universal links open here.
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function JobsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/job/[id]', params: { id } }} />;
}
