
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Monitor, Smartphone, Code, Palette, Database, Shield, ArrowRight, Phone, Mail } from "lucide-react";

export function Services() {
  const handleCall = () => {
    window.location.href = "tel:+918261861224";
  };

  const handleEmail = () => {
    window.location.href = "mailto:support@bitwix.co.in?subject=Service Inquiry&body=Hello Bitwix Team,%0D%0A%0D%0AI am interested in your services. Please provide more information about:%0D%0A%0D%0A☐ Website Development%0D%0A☐ Android App Development%0D%0A%0D%0AThank you.";
  };

  const services = [
    {
      icon: Monitor,
      title: "Website Development",
      description: "Create stunning, responsive websites that captivate your audience and drive business growth.",
      features: [
        "Responsive Design",
        "E-commerce Solutions",
        "Content Management Systems",
        "SEO Optimization",
        "Performance Optimization",
        "Custom Web Applications"
      ],
      color: "bg-blue-500"
    },
    {
      icon: Smartphone,
      title: "Android App Development",
      description: "Build powerful Android applications that deliver exceptional user experiences and functionality.",
      features: [
        "Native Android Apps",
        "Cross-Platform Solutions",
        "UI/UX Design",
        "API Integration",
        "App Store Deployment",
        "Maintenance &amp; Support"
      ],
      color: "bg-green-500"
    }
  ];

  const additionalServices = [
    { icon: Code, title: "Custom Development", description: "Tailored solutions for unique business requirements" },
    { icon: Palette, title: "UI/UX Design", description: "User-centered design that enhances user experience" },
    { icon: Database, title: "Database Solutions", description: "Robust data management and storage solutions" },
    { icon: Shield, title: "Security Services", description: "Comprehensive security implementation and auditing" }
  ];

  return (
    <section id="services" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Our Services
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            We specialize in two core areas that drive digital transformation for businesses 
            of all sizes. From concept to deployment, we deliver solutions that make a difference.
          </p>
        </div>

        {/* Main Services */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <Card key={index} className="hover:shadow-xl transition-shadow border-2 hover:border-primary/20">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className={`${service.color} w-12 h-12 rounded-lg flex items-center justify-center`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <CardTitle className="text-xl">{service.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-6">{service.description}</p>
                  <div className="space-y-2 mb-6">
                    {service.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-primary rounded-full"></div>
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCall} className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Discuss Project
                    </Button>
                    <Button variant="outline" onClick={handleEmail} className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Get Quote
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Additional Services */}
        <div className="bg-secondary/10 rounded-lg p-8 md:p-12">
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-foreground mb-4">Additional Services</h3>
            <p className="text-muted-foreground">
              Beyond our core offerings, we provide comprehensive technology solutions to support your business growth.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {additionalServices.map((service, index) => {
              const Icon = service.icon;
              return (
                <div key={index} className="text-center">
                  <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <Icon className="h-8 w-8 text-primary" />
                  </div>
                  <h4 className="font-semibold mb-2">{service.title}</h4>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <Button size="lg" onClick={handleCall} className="flex items-center gap-2 mx-auto">
              Let's Discuss Your Project
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
