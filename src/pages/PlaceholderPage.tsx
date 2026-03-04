interface Props {
  title: string;
}

export default function PlaceholderPage({ title }: Props) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl text-accent">{title}</h1>
      <div className="bg-card rounded-[20px] shadow-soft p-12 flex items-center justify-center">
        <p className="text-muted-foreground">Page en construction</p>
      </div>
    </div>
  );
}
