'use client';
import type { ImageConfig, ImageData } from '@/lib/image-model';
import { ImageChatStudio } from '@/ui/image-chat-studio';
export default function ImagesPage(props: {
  config: ImageConfig;
  initialData: ImageData;
  today: string;
  syncWindow: string;
  initialTopic: string | null;
  initialContent?: string | null;
}) {
  return (
    <ImageChatStudio
      config={props.config}
      initialData={props.initialData}
      today={props.today}
      syncWindow={props.syncWindow}
    />
  );
}
