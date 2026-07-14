
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Phone, Mail, Globe, MapPin, Clock, Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { submitContact } from "../lib/api";

type SubmitStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: ""
  });
  const [status, setStatus] = useState<SubmitStatus>({ type: "idle" });

  const handleCall = () => {
    window.location.href = "tel:+918261861224";
  };

  const handleEmail = () => {
    window.location.href = "mailto:support@bitwix.co.in?subject=Contact Form Inquiry&body=Hello Bitwix Team,%0D%0A%0D%0AI am reaching out to discuss potential collaboration.%0D%0A%0D%0AThank you.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: "loading" });
    try {
      const result = await submitContact(formData);
      if (result.success) {
        setStatus({
          type: "success",
          message: result.message || "Your message has been sent. We'll get back to you soon."
        });
        setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
      } else {
        const firstError = result.errors ? Object.values(result.errors)[0] : undefined;
        setStatus({
          type: "error",
          message: firstError || result.message || "Something went wrong. Please try again."
        });
      }
    } catch {
      setStatus({
        type: "error",
        message: "Unable to reach the server. Please try again or email us directly."
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const contactInfo = [
    {
      icon: Phone,
      title: "Phone",
      details: "+91-8261861224",
      description: "Call us for immediate assistance",
      action: handleCall
    },
    {
      icon: Mail,
      title: "Email",
      details: "support@bitwix.co.in",
      description: "Send us your questions anytime",
      action: handleEmail
    },
    {
      icon: Globe,
      title: "Website",
      details: "www.bitwix.co.in",
      description: "Visit our official website",
      action: () => window.open("https://www.bitwix.co.in", "_blank")
    },
    {
      icon: Clock,
      title: "Business Hours",
      details: "Mon - Sat: 9:00 AM - 6:00 PM",
      description: "We're here to help during business hours"
    }
  ];

  return (
    <section id="contact" className="scroll-mt-20 py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Get In Touch
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Ready to start your project? We'd love to hear from you. Contact us today 
            and let's discuss how we can help transform your ideas into reality.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Information */}
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-8">Contact Information</h3>
            
            <div className="space-y-6 mb-8">
              {contactInfo.map((info, index) => {
                const Icon = info.icon;
                return (
                  <Card 
                    key={index} 
                    className={`hover:shadow-lg transition-shadow ${info.action ? 'cursor-pointer' : ''}`}
                    onClick={info.action}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">{info.title}</h4>
                          <p className="text-primary font-medium mb-1">{info.details}</p>
                          <p className="text-sm text-muted-foreground">{info.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Quick Contact Buttons */}
            <div className="bg-primary/5 rounded-lg p-6">
              <h4 className="font-semibold text-foreground mb-4">Quick Contact</h4>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleCall} className="flex items-center gap-2 flex-1">
                  <Phone className="h-4 w-4" />
                  Call Now
                </Button>
                <Button variant="outline" onClick={handleEmail} className="flex items-center gap-2 flex-1">
                  <Mail className="h-4 w-4" />
                  Email Us
                </Button>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Send Us a Message</CardTitle>
                <p className="text-muted-foreground">
                  Fill out the form below and we'll get back to you as soon as possible.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium mb-2">
                        Name *
                      </label>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="Your full name"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium mb-2">
                        Phone
                      </label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="Your phone number"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2">
                      Email *
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="your.email@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="subject" className="block text-sm font-medium mb-2">
                      Subject
                    </label>
                    <Input
                      id="subject"
                      name="subject"
                      type="text"
                      value={formData.subject}
                      onChange={handleInputChange}
                      placeholder="What's this about?"
                    />
                  </div>

                  <div>
                    <label htmlFor="message" className="block text-sm font-medium mb-2">
                      Message *
                    </label>
                    <Textarea
                      id="message"
                      name="message"
                      required
                      value={formData.message}
                      onChange={handleInputChange}
                      placeholder="Tell us about your project or inquiry..."
                      rows={5}
                    />
                  </div>

                  {status.type === "success" && (
                    <div className="flex items-start gap-2 rounded-md bg-green-500/10 text-green-700 p-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <span>{status.message}</span>
                    </div>
                  )}
                  {status.type === "error" && (
                    <div className="flex items-start gap-2 rounded-md bg-red-500/10 text-red-700 p-3 text-sm">
                      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <span>{status.message}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={status.type === "loading"}
                    className="w-full flex items-center gap-2"
                  >
                    {status.type === "loading" ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Additional Contact Section */}
        <div className="mt-16 bg-secondary/10 rounded-lg p-8 md:p-12 text-center">
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Bitwix Technologies Private Limited
          </h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Your trusted partner for website development and Android app development. 
            We're committed to delivering exceptional digital solutions that help your business grow.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Phone className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium">Phone Support</p>
              <p className="text-sm text-muted-foreground">+91-8261861224</p>
            </div>
            <div>
              <Mail className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium">Email Support</p>
              <p className="text-sm text-muted-foreground">support@bitwix.co.in</p>
            </div>
            <div>
              <Globe className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="font-medium">Official Website</p>
              <p className="text-sm text-muted-foreground">www.bitwix.co.in</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
