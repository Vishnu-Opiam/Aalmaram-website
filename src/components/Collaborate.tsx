import CollaborateForm from "./CollaborateForm";

export default function Collaborate() {
  return (
    <section id="collaborate" className="relative">
      <div className="max-w-[1480px] mx-auto px-6 md:px-14 py-24 md:py-40">
        <div className="grid md:grid-cols-12 gap-14 md:gap-10 items-start">
          <div className="md:col-span-6 reveal">
            <div className="text-[11px] tracking-[.34em] font-body font-light opacity-70 mb-8">04 · COLLABORATE WITH US</div>
            <h2 className="font-display font-black display-tight text-night" style={{ fontSize: "clamp(40px, 6vw, 88px)" }}>
              Have a story <span className="font-display italic font-medium" style={{ color: "var(--kathakali)" }}>worth telling?</span>
            </h2>
            <p className="mt-10 max-w-[46ch] font-body font-light leading-loose text-[17px]" style={{ color: "#2a3855" }}>
              If you have a story, an idea, or a piece of Kerala&apos;s history that could become something
              beautiful for children, we&apos;d love to hear it. Every book we make begins as a conversation.
            </p>
          </div>

          <div className="md:col-span-6 md:pt-4 reveal">
            <CollaborateForm />
          </div>
        </div>
      </div>
    </section>
  );
}
