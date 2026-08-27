import Image from "next/image";

interface ProfilePortraitProps {
  alt?: string;
  src?: string;
}

export function ProfilePortrait({
  alt = "KatBose profile portrait",
  src = "/profile-fallback.svg",
}: Readonly<ProfilePortraitProps>) {
  return (
    <Image
      alt={alt}
      className="profile-portrait"
      height={96}
      priority
      sizes="(min-width: 640px) 96px, 80px"
      src={src}
      width={96}
    />
  );
}
