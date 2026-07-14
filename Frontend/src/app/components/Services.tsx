import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Monitor, Smartphone, Layers, Bot, Network, Palette, LifeBuoy, Sparkles, ArrowRight, Phone } from "lucide-react";

interface Category {
  icon: typeof Monitor;
  title: string;
  description: string;
  items: string[];
  color: string;
  badge?: string;
}

// The full capability catalog, shown as tiles.
const catalog: Category[] = [
  {
    icon: Monitor,
    title: "Web Development",
    description: "Fast, scalable, conversion-focused websites and web apps.",
    color: "bg-blue-500",
    items: ["Business & corporate sites", "Portfolio websites", "E-commerce", "Marketplace platforms", "SaaS applications", "CRM systems", "ERP systems", "Admin dashboards", "Landing pages", "Progressive Web Apps (PWA)"],
  },
  {
    icon: Smartphone,
    title: "Mobile App Development",
    description: "Native and cross-platform apps for Android and iOS.",
    color: "bg-green-500",
    items: ["Android apps", "iOS apps", "Cross-platform (React Native / Flutter)", "Enterprise apps", "E-commerce apps", "Food delivery apps", "Healthcare apps", "Education apps", "Booking apps", "Social networking apps"],
  },
  {
    icon: Layers,
    title: "Custom Software Development",
    description: "Tailored systems that run your entire operation.",
    color: "bg-purple-500",
    items: ["CRM development", "ERP development", "Inventory management", "HRMS", "Hospital management", "School / College ERP", "Billing software", "Accounting software", "POS software", "Warehouse management", "Manufacturing software"],
  },
  {
    icon: Bot,
    title: "AI & Automation",
    description: "Chatbots, agents, and automation that save real hours.",
    color: "bg-orange-500",
    badge: "High demand",
    items: ["AI chatbots", "Customer support bots", "WhatsApp AI bot", "AI voice assistant", "AI document processing", "AI email automation", "Resume screening", "AI knowledge base", "AI agents", "RAG applications", "LLM integration (OpenAI / Gemini / Claude)"],
  },
  {
    icon: Network,
    title: "API Development & Integration",
    description: "Connect your systems, payments, and third-party services.",
    color: "bg-cyan-500",
    items: ["Payment gateways", "SMS gateway", "Email services", "WhatsApp API", "Google Maps API", "Firebase", "ERP integration", "CRM integration", "Shipping APIs", "GST APIs"],
  },
  {
    icon: Palette,
    title: "UI/UX Design",
    description: "Interfaces users love — designed before we build.",
    color: "bg-pink-500",
    items: ["UI design", "UX design", "Wireframes", "Prototypes", "Dashboard design", "Mobile app design", "Landing page design", "Design systems"],
  },
  {
    icon: LifeBuoy,
    title: "Maintenance & Support",
    description: "Keep your product secure, fast, and always improving.",
    color: "bg-teal-500",
    items: ["Bug fixes", "Security updates", "Server monitoring", "Backups", "Performance optimization", "Feature enhancements", "Technical support"],
  },
];

export function Services() {
  const handleCall = () => { window.location.href = "tel:+918261861224"; };
  const scrollToContact = () => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section id="services" className="scroll-mt-20 py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Our Services</h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            From websites and mobile apps to custom software, AI automation, integrations, and
            ongoing support — everything you need to build and run your digital product.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {catalog.map((cat) => {
            const Icon = cat.icon;
            return (
              <Card key={cat.title} className="flex flex-col hover:shadow-xl transition-shadow border-2 hover:border-primary/20">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className={`${cat.color} w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg leading-tight">{cat.title}</CardTitle>
                      {cat.badge && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-orange-600">
                          <Sparkles className="h-3 w-3" /> {cat.badge}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground mb-4">{cat.description}</p>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {cat.items.map((item) => (
                      <span key={item} className="bg-secondary text-secondary-foreground/90 rounded-md px-2 py-1 text-xs">
                        {item}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-14 bg-secondary/10 rounded-lg p-8 md:p-12 text-center">
          <h3 className="text-2xl font-bold text-foreground mb-3">Not sure where to start?</h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Tell us what you're building and we'll recommend the right approach, stack, and timeline.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={scrollToContact} className="flex items-center gap-2">
              Let's Discuss Your Project <ArrowRight className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="lg" onClick={handleCall} className="flex items-center gap-2">
              <Phone className="h-5 w-5" /> Call Now
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
