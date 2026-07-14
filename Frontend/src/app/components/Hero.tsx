
import { Button } from "./ui/button";
import { Phone, Mail, ArrowRight } from "lucide-react";

export function Hero() {
  const handleCall = () => {
    window.location.href = "tel:+918261861224";
  };

  const handleEmail = () => {
    window.location.href = "mailto:support@bitwix.co.in?subject=Project Inquiry&body=Hello Bitwix Team,%0D%0A%0D%0AI would like to discuss a project with you. Please contact me at your earliest convenience.%0D%0A%0D%0AThank you.";
  };

  return (
    <section id="home" className="scroll-mt-20 bg-gradient-to-br from-primary/5 via-background to-secondary/10 py-20 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
            Transform Your Ideas Into
            <span className="text-primary block">Digital Reality</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Bitwix Technologies Private Limited specializes in cutting-edge website development 
            and Android app development. We bring your vision to life with innovative solutions 
            and exceptional user experiences.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button size="lg" onClick={handleCall} className="flex items-center gap-2 px-8">
              <Phone className="h-5 w-5" />
              Call Now
            </Button>
            <Button variant="outline" size="lg" onClick={handleEmail} className="flex items-center gap-2 px-8">
              <Mail className="h-5 w-5" />
              Email Us
            </Button>
            <Button variant="ghost" size="lg" asChild className="flex items-center gap-2">
              <a href="#services">
                View Services
                <ArrowRight className="h-5 w-5" />
              </a>
            </Button>
          </div>

          {/* Contact Info */}
          <div className="bg-white/80 backdrop-blur-sm rounded-lg p-6 max-w-2xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Phone</p>
                <p className="font-medium">+91-8261861224</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Email</p>
                <p className="font-medium">support@bitwix.co.in</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Website</p>
                <p className="font-medium">www.bitwix.co.in</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
