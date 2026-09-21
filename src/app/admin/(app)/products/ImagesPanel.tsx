"use client";

import { useActionState } from "react";
import { deleteImage, moveImage, updateImageAlt, uploadImage, type ActionState } from "./actions";

const INITIAL: ActionState = { error: "" };

export interface AdminImage {
  id: string;
  url: string;
  alt: string;
}

export default function ImagesPanel({
  productId,
  images,
}: {
  productId: string;
  images: AdminImage[];
}) {
  const [state, formAction, pending] = useActionState(uploadImage, INITIAL);

  return (
    <section className="admin-card p-5 sm:p-6">
      <h2 className="font-semibold text-[20px]" style={{ color: "var(--night)" }}>
        Images
      </h2>
      <p className="mt-2 text-[12px] opacity-60">
        The cover is the one the shop and basket show; the rest follow in order on the product page. PNG, JPEG, WebP or AVIF, under 5 MB.
      </p>

      {images.length > 0 && (
        <ul className="mt-6 grid grid-cols-3 gap-4">
          {images.map((image, i) => (
            <li key={image.id}>
              <div
                className="rounded-sm overflow-hidden"
                style={{ aspectRatio: "3/4.3", background: "rgba(35,47,72,.08)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.url} alt={image.alt} className="w-full h-full object-cover" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[12px] opacity-55">
                  {i === 0 ? "Cover" : `#${i + 1}`}
                </span>
                <div className="flex items-center">
                  {i > 0 && <ImageMove id={image.id} direction="first" label="Make cover" />}
                  {i > 0 && <ImageMove id={image.id} direction="up" label="←" aria="Move earlier" />}
                  {i < images.length - 1 && (
                    <ImageMove id={image.id} direction="down" label="→" aria="Move later" />
                  )}
                </div>
              </div>
              <form action={updateImageAlt} className="mt-1">
                <input type="hidden" name="image_id" value={image.id} />
                <input
                  name="alt"
                  defaultValue={image.alt}
                  placeholder="Alt text"
                  aria-label="Alt text"
                  onBlur={(e) => {
                    if (e.currentTarget.value !== image.alt) e.currentTarget.form?.requestSubmit();
                  }}
                  className="preorder-input !mt-0 !py-1 text-[12px] w-full"
                />
              </form>
              <form
                action={deleteImage}
                onSubmit={(e) => {
                  if (!confirm("Remove this image?")) e.preventDefault();
                }}
              >
                <input type="hidden" name="image_id" value={image.id} />
                <button type="submit" className="mt-1 text-[12px]" style={{ color: "var(--spice)" }}>
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="product_id" value={productId} />
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          required
          className="block w-full text-[13px]"
        />
        <input
          name="alt"
          placeholder="Describe the image, for screen readers"
          className="preorder-input text-[14px] w-full"
        />
        {state.error && (
          <p className="text-[12.5px]" style={{ color: "var(--spice)" }}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="text-[12.5px]" style={{ color: "var(--kathakali)" }}>
            {state.ok}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-night px-4 py-2.5 text-[13px]"
        >
          {pending ? "Uploading…" : "Add image"}
        </button>
      </form>
    </section>
  );
}

function ImageMove({
  id,
  direction,
  label,
  aria,
}: {
  id: string;
  direction: string;
  label: string;
  aria?: string;
}) {
  return (
    <form action={moveImage}>
      <input type="hidden" name="image_id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        aria-label={aria ?? label}
        title={aria ?? label}
        className="text-[12px] px-1.5 py-0.5 rounded hover:bg-[var(--a-hover)]"
      >
        {label}
      </button>
    </form>
  );
}
