import Image from 'next/image'

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
    <article className="homepage-showcase-card homepage-showcase-surface overflow-hidden rounded-2xl transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
      <div className="aspect-[4/3] overflow-hidden">
        <Image
          src={src}
          alt={`${model}: ${prompt}`}
          width={640}
          height={480}
          className="block w-full h-full object-cover transition-transform duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.06]"
        />
      </div>
      <div className="grid gap-1 px-4 py-[0.85rem]">
        <span className="text-[0.68rem] font-semibold tracking-[0.12em] uppercase text-primary opacity-85">
          {model}
        </span>
        <p className="font-serif text-[0.92rem] leading-[1.5] text-[var(--home-muted)] line-clamp-2">
          {prompt}
        </p>
      </div>
    </article>
  )
}
