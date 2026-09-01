import { useResolvedMediaUrl } from "@/lib/mediaUrl";

type Props = React.VideoHTMLAttributes<HTMLVideoElement> & { src?: string };

/**
 * <video> that transparently signs Supabase private-bucket URLs (generated
 * videos live in the private `media-studio` bucket).
 */
export function SecureVideo({ src, ...props }: Props) {
  const resolved = useResolvedMediaUrl(src);
  return <video src={resolved} {...props} />;
}

export default SecureVideo;
