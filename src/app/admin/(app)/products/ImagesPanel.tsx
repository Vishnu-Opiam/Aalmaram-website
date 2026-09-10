"use client";

import { useActionState } from "react";
import { deleteImage, uploadImage, type ActionState } from "./actions";

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
    <section>
      <h2 className="font-display italic text-[20px]" style={{ color: "var(--night)" }}>
        Images
      </h2>
      <p className="mt-2 text-[12px] font-body font-light opacity-60">
        The first image is the one the shop and basket show. PNG, JPEG, WebP or AVIF, under 5 MB.
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
                <span className="text-[10.5px] tracking-[.2em] font-body opacity-55">
                  {i === 0 ? "PRIMARY" : `#${i + 1}`}
                </span>
                <form action={deleteImage}>
                  <input type="hidden" name="image_id" value={image.id} />
                  <button
                    type="submit"
                    className="text-[10.5px] tracking-[.2em] font-body font-light"
                    style={{ color: "var(--spice)" }}
                  >
                    REMOVE
                  </button>
                </form>
              </div>
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
          className="block w-full text-[13px] font-body font-light"
        />
        <input
          name="alt"
          placeholder="Describe the image, for screen readers"
          className="preorder-input font-body text-[14px] w-full"
        />
        {state.error && (
          <p className="text-[12.5px] font-body" style={{ color: "var(--spice)" }}>
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="text-[12.5px] font-body" style={{ color: "var(--kathakali)" }}>
            {state.ok}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-night px-7 py-3 text-[11.5px] tracking-[.24em] font-body font-normal"
        >
          {pending ? "Uploading…" : "Add image"}
        </button>
      </form>
    </section>
  );
}
