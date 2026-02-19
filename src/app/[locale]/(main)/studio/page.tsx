import { GenerateForm } from "@/components/business/GenerateForm";

export default function StudioPage() {
  return (
    <div className="flex min-h-screen items-start justify-center px-4 py-12 sm:py-20">
      <div className="w-full max-w-2xl space-y-8">
        {/* Page Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Personal AI Gallery
          </h1>
          <p className="text-muted-foreground">
            Generate stunning images with AI — choose a model, describe your
            vision, and create.
          </p>
        </div>

        {/* Generate Form */}
        <GenerateForm />
      </div>
    </div>
  );
}
