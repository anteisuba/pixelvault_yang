import Image from 'next/image'

import styles from './HomepageShell.module.css'

interface HomepageShowcaseCardProps {
  src: string
  model: string
  prompt: string
}

export function HomepageShowcaseCard({
  src,
  model,
  prompt,
}: HomepageShowcaseCardProps) {
  return (
    <article className={styles.showcaseCard}>
      <div className={styles.showcaseCardImageWrap}>
        <Image
          src={src}
          alt={`${model}: ${prompt}`}
          width={640}
          height={480}
          className={styles.showcaseCardImage}
        />
      </div>
      <div className={styles.showcaseCardOverlay}>
        <span className={styles.showcaseCardModel}>{model}</span>
        <p className={styles.showcaseCardPrompt}>{prompt}</p>
      </div>
    </article>
  )
}
