import Link from "next/link";
import ProductForm from "../ProductForm";
import { requireAdmin } from "@/lib/admin-auth";

export const metadata = { title: "New product - Aalmaram admin" };

export default async function NewProductPage() {
  await requireAdmin();

  return (
    <div>
      <Link href="/admin/products" className="qlink text-[11px] tracking-[.26em] font-body font-light">
        ← PRODUCTS
      </Link>
      <h1
        className="mt-5 font-display font-black text-[34px] display-tight"
        style={{ color: "var(--night)" }}
      >
        New product
      </h1>
      <p className="mt-3 font-body font-light text-[14px] opacity-70">
        Images can be added once it exists. It stays a draft until you set it active.
      </p>

      <ProductForm
        mode="create"
        values={{
          title: "",
          handle: "",
          subtitle: "",
          descriptionMd: "",
          status: "draft",
          tags: "",
          hsnCode: "4901",
          seoTitle: "",
          seoDescription: "",
          price: "",
          compareAt: "",
          sku: "",
          inventoryQuantity: "0",
          weightGrams: "0",
          lengthCm: "0",
          breadthCm: "0",
          heightCm: "0",
        }}
      />
    </div>
  );
}
